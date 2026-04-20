const { google } = require('googleapis');
const ExcelJS = require('exceljs');

const SPREADSHEET_HEADERS = {
  products: ['Product ID', 'Name', 'Category', 'Subcategory', 'Collection', 'Season', 'Fabric', 'Cost Price', 'Price', 'Sale Price', 'Currency', 'SKU', 'Stock Qty', 'Status', 'Tags', 'Image Link', 'Created At'],
  orders: ['Order ID', 'Customer ID', 'Customer Name', 'Phone', 'Subtotal', 'Discount', 'Shipping', 'Tax', 'Total', 'Currency', 'Status', 'Channel', 'Priority', 'Shipping Method', 'Courier', 'Tracking #', 'Address', 'Est. Delivery', 'Notes', 'Order Date'],
  customers: ['Customer ID', 'Full Name', 'Email', 'Phone', 'WhatsApp', 'City', 'Country', 'Address', 'Gender', 'Segment', 'Source', 'Total Spent', 'Total Orders', 'Loyalty Points', 'Date Joined', 'Subscribed', 'Tags', 'Notes'],
  financial: ['Transaction ID', 'Order ID', 'Customer ID', 'Customer Name', 'Order Status', 'Order Total', 'Amount', 'Payment Method', 'Payment Status', 'Transaction Date'],
  suppliers: ['Supplier ID', 'Name', 'Contact Person', 'Email', 'Phone', 'WhatsApp', 'City', 'Country', 'Category', 'Materials', 'Rating', 'Lead Time (Days)', 'Min Order', 'Payment Terms', 'Active', 'Total Purchased', 'Notes'],
  collections: ['Collection ID', 'Name', 'Description', 'Season', 'Year', 'Theme', 'Status', 'Launch Date', 'Product Count', 'Notes'],
  returns: ['Return ID', 'Order ID', 'Customer ID', 'Customer Name', 'Product ID', 'Product Name', 'Reason', 'Type', 'Status', 'Refund Amount', 'Return Date', 'Notes'],
};

class GoogleSheetsService {
  constructor(accessToken, refreshToken) {
    this.auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    this.refreshToken = refreshToken;
    this.auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    this.drive = google.drive({ version: 'v3', auth: this.auth });
  }

  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }
    try {
      const { credentials } = await this.auth.refreshAccessToken();
      this.auth.setCredentials(credentials);
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      this.drive = google.drive({ version: 'v3', auth: this.auth });
      return credentials.access_token;
    } catch (err) {
      throw new Error(`Failed to refresh access token: ${err.message}`);
    }
  }

  async ensureValidToken() {
    const credentials = this.auth.credentials;
    if (!credentials || !credentials.access_token) {
      await this.refreshAccessToken();
      return;
    }
    // Check if token is expired or about to expire (within 5 minutes)
    if (credentials.expiry_date && credentials.expiry_date < Date.now() + 5 * 60 * 1000) {
      await this.refreshAccessToken();
    }
  }

  async createSpreadsheet(title, folderId, sheetType) {
    await this.ensureValidToken();
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
    await this.ensureValidToken();
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
    await this.ensureValidToken();
    await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `A${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [values] },
    });
  }

  async deleteRow(spreadsheetId, rowIndex) {
    if (!spreadsheetId || !rowIndex) return;
    await this.ensureValidToken();
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

  async listFilesInFolder(folderId) {
    const { data } = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType)',
    });
    return data.files || [];
  }

  async getSheetValues(spreadsheetId, range = 'A2:Z') {
    await this.ensureValidToken();
    const { data } = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    return data.values || [];
  }

  async getExcelValues(fileId) {
    try {
      await this.ensureValidToken();
      const response = await this.drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );
      
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.read(response.data);
      
      const ws = wb.worksheets[0]; // Read the primary sheet
      if (!ws) return [];

      const rows = [];
      ws.eachRow((row, rowNumber) => {
        // exceljs values array is 1-indexed (index 0 is empty)
        const rowValues = (row.values || []).slice(1).map(val => {
          if (val === null || val === undefined) return '';
          if (typeof val === 'object') {
            if (val.richText) return val.richText.map(rt => rt.text).join('');
            if (val.result !== undefined) return val.result;
            if (val instanceof Date) return val.toISOString();
            if (val.text) return val.text;
          }
          return val;
        });
        rows.push(rowValues);
      });

      // Skip the header row to mimic getSheetValues(A2:Z)
      if (rows.length > 0) {
        return rows.slice(1);
      }
      return [];
    } catch (err) {
      console.error('Error parsing .xlsx from drive:', err);
      return [];
    }
  }

  // Maps a spreadsheet row array back to a model object based on SPREADSHEET_HEADERS
  parseRowToModel(row, type) {
    if (!row || row.length === 0) return null;
    const headers = SPREADSHEET_HEADERS[type];
    if (!headers) return null;

    const data = {};
    const map = {
      products: {
        'Product ID': 'productId', 'Name': 'name', 'Category': 'category', 'Subcategory': 'subcategory',
        'Collection': 'collection', 'Season': 'season', 'Fabric': 'fabric', 'Cost Price': 'costPrice',
        'Price': 'price', 'Sale Price': 'salePrice', 'Currency': 'currency', 'SKU': 'sku',
        'Stock Qty': 'stockQty', 'Status': 'status', 'Tags': 'tags', 'Image Link': 'imageLink'
      },
      orders: {
        'Order ID': 'orderId', 'Customer ID': 'customerId', 'Customer Name': 'customerName',
        'Phone': 'customerPhone', 'Subtotal': 'subtotal', 'Discount': 'discountAmount',
        'Shipping': 'shippingCost', 'Tax': 'taxAmount', 'Total': 'total', 'Currency': 'currency',
        'Status': 'status', 'Channel': 'channel', 'Priority': 'priority', 'Shipping Method': 'shippingMethod',
        'Courier': 'courierName', 'Tracking #': 'trackingNumber', 'Address': 'shippingAddress',
        'Est. Delivery': 'estimatedDelivery', 'Notes': 'notes', 'Order Date': 'orderDate'
      },
      customers: {
        'Customer ID': 'customerId', 'Full Name': 'fullName', 'Email': 'email', 'Phone': 'phone',
        'WhatsApp': 'whatsapp', 'City': 'city', 'Country': 'country', 'Address': 'address',
        'Gender': 'gender', 'Segment': 'segment', 'Source': 'source', 'Total Spent': 'totalSpent',
        'Total Orders': 'totalOrders', 'Loyalty Points': 'loyaltyPoints', 'Date Joined': 'dateJoined',
        'Subscribed': 'subscribed', 'Tags': 'tags', 'Notes': 'notes'
      },
      financial: {
        'Transaction ID': 'transactionId', 'Order ID': 'orderId', 'Customer ID': 'customerId',
        'Customer Name': 'customerName', 'Order Status': 'orderStatus', 'Order Total': 'orderTotal', 'Amount': 'price',
        'Payment Method': 'paymentMethod', 'Payment Status': 'paymentStatus', 'Transaction Date': 'transactionDate'
      },
      suppliers: {
        'Supplier ID': 'supplierId', 'Name': 'name', 'Contact Person': 'contactPerson',
        'Email': 'email', 'Phone': 'phone', 'WhatsApp': 'whatsapp', 'City': 'city',
        'Country': 'country', 'Category': 'category', 'Materials': 'materials',
        'Rating': 'rating', 'Lead Time (Days)': 'leadTime', 'Min Order': 'minOrder',
        'Payment Terms': 'paymentTerms', 'Active': 'active', 'Total Purchased': 'totalPurchased', 'Notes': 'notes'
      },
      collections: {
        'Collection ID': 'collectionId', 'Name': 'name', 'Description': 'description',
        'Season': 'season', 'Year': 'year', 'Theme': 'theme', 'Status': 'status',
        'Launch Date': 'launchDate', 'Product Count': 'productCount', 'Notes': 'notes'
      },
      returns: {
        'Return ID': 'returnId', 'Order ID': 'orderId', 'Customer ID': 'customerId',
        'Customer Name': 'customerName', 'Product ID': 'productId', 'Product Name': 'productName',
        'Reason': 'reason', 'Type': 'type', 'Status': 'status',
        'Refund Amount': 'refundAmount', 'Return Date': 'returnDate', 'Notes': 'notes'
      }
    };

    const typeMap = map[type];
    if (!typeMap) return null;

    headers.forEach((header, i) => {
      const field = typeMap[header];
      if (field) {
        let val = row[i];
        // Basic type conversion
        if (['price', 'costPrice', 'salePrice', 'total', 'subtotal', 'discountAmount', 'shippingCost', 'taxAmount', 'amount', 'orderTotal', 'stockQty', 'totalSpent', 'totalOrders', 'loyaltyPoints', 'rating', 'leadTime', 'minOrder', 'totalPurchased', 'productCount', 'refundAmount'].includes(field)) {
          val = parseFloat(String(val).replace(/[^0-9.-]+/g, '')) || 0;
        } else if (['tags', 'materials'].includes(field)) {
          val = val ? String(val).split(',').map(t => t.trim()) : [];
        } else if (['active', 'subscribed'].includes(field)) {
          val = String(val).toLowerCase() === 'true' || String(val) === '1';
        } else if (field.endsWith('Date') || field.endsWith('Delivery') || field === 'dateJoined') {
          val = val ? new Date(val) : null;
          if (val && isNaN(val.getTime())) val = null;
        }
        data[field] = val;
      }
    });

    return data;
  }
}

// Fire-and-forget wrapper: runs sync in background, never blocks API response
function syncAsync(fn) {
  fn().catch(err => console.error('Background sheets sync error:', err.message));
}

module.exports = { GoogleSheetsService, syncAsync, SPREADSHEET_HEADERS };