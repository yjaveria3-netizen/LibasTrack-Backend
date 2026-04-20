const { google } = require('googleapis');

const SPREADSHEET_HEADERS = {
  products: ['Product ID', 'Name', 'Category', 'Subcategory', 'Collection', 'Season', 'Fabric', 'Cost Price', 'Price', 'Sale Price', 'Currency', 'SKU', 'Stock Qty', 'Status', 'Tags', 'Image Link', 'Created At'],
  orders: ['Order ID', 'Customer ID', 'Customer Name', 'Phone', 'Subtotal', 'Discount', 'Shipping', 'Tax', 'Total', 'Currency', 'Status', 'Channel', 'Priority', 'Shipping Method', 'Courier', 'Tracking #', 'Address', 'Est. Delivery', 'Notes', 'Order Date'],
  customers: ['Customer ID', 'Full Name', 'Email', 'Phone', 'WhatsApp', 'City', 'Country', 'Address', 'Gender', 'Segment', 'Source', 'Total Spent', 'Total Orders', 'Loyalty Points', 'Date Joined', 'Subscribed', 'Tags', 'Notes'],
  financial: ['Transaction ID', 'Order ID', 'Amount', 'Payment Method', 'Payment Status', 'Transaction Date'],
  suppliers: ['Supplier ID', 'Name', 'Contact Person', 'Email', 'Phone', 'WhatsApp', 'City', 'Country', 'Category', 'Materials', 'Rating', 'Lead Time (Days)', 'Min Order', 'Payment Terms', 'Active', 'Total Purchased', 'Notes'],
  collections: ['Collection ID', 'Name', 'Description', 'Season', 'Year', 'Theme', 'Status', 'Launch Date', 'Product Count', 'Notes'],
  returns: ['Return ID', 'Order ID', 'Customer ID', 'Customer Name', 'Reason', 'Status', 'Resolution', 'Refund Amount', 'Return Date', 'Notes'],
};

class GoogleSheetsService {
  constructor(accessToken, refreshToken) {
    this.auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    this.auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    this.drive = google.drive({ version: 'v3', auth: this.auth });
  }

  async createSpreadsheet(title, folderId, sheetType) {
    const headers = SPREADSHEET_HEADERS[sheetType] || [];
    const resource = {
      properties: { title },
      sheets: [{ properties: { title: sheetType.charAt(0).toUpperCase() + sheetType.slice(1) } }],
    };
    const { data } = await this.sheets.spreadsheets.create({ resource });
    const spreadsheetId = data.spreadsheetId;
    const sheetId = data.sheets?.[0]?.properties?.sheetId || 0;

    // Write header row
    if (headers.length) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'A1',
        valueInputOption: 'RAW',
        resource: { values: [headers] },
      });
      // Format header: bold, sky-blue background
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.055, green: 0.647, blue: 0.914 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)',
              },
            },
            { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
          ],
        },
      });
    }

    // Move to folder if provided
    if (folderId) {
      await this.drive.files.update({
        fileId: spreadsheetId,
        addParents: folderId,
        removeParents: 'root',
        fields: 'id, parents',
      });
    }
    return spreadsheetId;
  }

  async appendRow(spreadsheetId, values) {
    if (!spreadsheetId) return null;
    const { data } = await this.sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'A:A',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [values] },
    });
    const updatedRange = data.updates?.updatedRange;
    if (updatedRange) {
      const match = updatedRange.match(/(\d+)$/);
      return match ? parseInt(match[1]) : null;
    }
    return null;
  }

  async updateRow(spreadsheetId, rowIndex, values) {
    if (!spreadsheetId || !rowIndex) return;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `A${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [values] },
    });
  }

  async deleteRow(spreadsheetId, rowIndex) {
    if (!spreadsheetId || !rowIndex) return;
    const { data } = await this.sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
    const sheetId = data.sheets?.[0]?.properties?.sheetId || 0;
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [{
          deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex },
          },
        }],
      },
    });
  }

  async getFolderIdFromLink(folderLink) {
    const match = folderLink.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  async findOrCreateSubfolder(parentId, folderName) {
    const { data } = await this.drive.files.list({
      q: `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)',
    });
    if (data.files?.length > 0) return data.files[0].id;
    const { data: created } = await this.drive.files.create({
      resource: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id',
    });
    return created.id;
  }
}

// Fire-and-forget wrapper: runs sync in background, never blocks API response
function syncAsync(fn) {
  fn().catch(err => console.error('Background sheets sync error:', err.message));
}

module.exports = { GoogleSheetsService, syncAsync, SPREADSHEET_HEADERS };