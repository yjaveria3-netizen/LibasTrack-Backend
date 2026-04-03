const { google } = require('googleapis');

class GoogleSheetsService {
  constructor(accessToken, refreshToken) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    this.sheets = google.sheets({ version: 'v4', auth: this.oauth2Client });
    this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
  }

  // Extract spreadsheet ID from Google Sheets URL
  extractSheetId(url) {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }

  // Extract folder ID from Google Drive URL
  extractFolderId(url) {
    const match = url.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    if (match) return match[1];
    const match2 = url.match(/id=([a-zA-Z0-9-_]+)/);
    return match2 ? match2[1] : null;
  }

  // Create or find a spreadsheet in Drive
  async findOrCreateSpreadsheet(folderId, sheetName, headers) {
    try {
      // Search for existing spreadsheet
      const searchRes = await this.drive.files.list({
        q: `'${folderId}' in parents and name='${sheetName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
        fields: 'files(id, name)'
      });

      if (searchRes.data.files.length > 0) {
        return searchRes.data.files[0].id;
      }

      // Create new spreadsheet
      const createRes = await this.sheets.spreadsheets.create({
        requestBody: {
          properties: { title: sheetName },
          sheets: [{
            properties: { title: 'Data' },
            data: [{
              startRow: 0,
              startColumn: 0,
              rowData: [{
                values: headers.map(h => ({
                  userEnteredValue: { stringValue: h },
                  userEnteredFormat: {
                    backgroundColor: { red: 0.18, green: 0.18, blue: 0.18 },
                    textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
                    horizontalAlignment: 'CENTER'
                  }
                }))
              }]
            }]
          }]
        }
      });

      const sheetId = createRes.data.spreadsheetId;

      // Move to folder
      await this.drive.files.update({
        fileId: sheetId,
        addParents: folderId,
        removeParents: 'root',
        fields: 'id, parents'
      });

      return sheetId;
    } catch (err) {
      console.error('Error creating spreadsheet:', err.message);
      throw err;
    }
  }

  // Append a row to a spreadsheet
  async appendRow(spreadsheetId, values) {
    try {
      const res = await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Data!A:Z',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [values] }
      });
      const updatedRange = res.data.updates.updatedRange;
      const rowNum = parseInt(updatedRange.match(/\d+$/)[0]);
      return rowNum;
    } catch (err) {
      console.error('Error appending row:', err.message);
      throw err;
    }
  }

  // Update a specific row
  async updateRow(spreadsheetId, rowIndex, values) {
    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Data!A${rowIndex}:Z${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [values] }
      });
    } catch (err) {
      console.error('Error updating row:', err.message);
      throw err;
    }
  }

  // Delete a row by clearing its content
  async deleteRow(spreadsheetId, rowIndex) {
    try {
      const sheetMeta = await this.sheets.spreadsheets.get({ spreadsheetId });
      const sheetId = sheetMeta.data.sheets[0].properties.sheetId;

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex - 1,
                endIndex: rowIndex
              }
            }
          }]
        }
      });
    } catch (err) {
      console.error('Error deleting row:', err.message);
      throw err;
    }
  }

  // Get all rows from sheet
  async getRows(spreadsheetId) {
    try {
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Data!A:Z'
      });
      return res.data.values || [];
    } catch (err) {
      console.error('Error getting rows:', err.message);
      throw err;
    }
  }
}

// Product sheet helpers
const PRODUCT_HEADERS = ['Product ID', 'Name', 'Category', 'Size', 'Color', 'Price (PKR)', 'Stock Qty', 'Image Link'];
const ORDER_HEADERS = ['Order ID', 'Customer ID', 'Product ID', 'Quantity', 'Total (PKR)', 'Status', 'Order Date'];
const CUSTOMER_HEADERS = ['Customer ID', 'Full Name', 'Email', 'Phone', 'Address', 'Date Joined'];
const FINANCIAL_HEADERS = ['Transaction ID', 'Order ID', 'Price', 'Payment Method', 'Payment Status', 'Transaction Date'];

module.exports = { GoogleSheetsService, PRODUCT_HEADERS, ORDER_HEADERS, CUSTOMER_HEADERS, FINANCIAL_HEADERS };
