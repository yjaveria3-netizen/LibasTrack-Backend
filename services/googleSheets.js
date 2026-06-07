const { google } = require('googleapis');
const XLSX = require('xlsx');

const SPREADSHEET_HEADERS = {
  products: ['Product ID', 'Name', 'Category', 'Subcategory', 'Collection', 'Season', 'Fabric', 'Cost Price', 'Price', 'Sale Price', 'Currency', 'SKU', 'Stock Qty', 'Status', 'Tags', 'Image Path', 'Supplier ID', 'Created At'],
  orders: ['Order ID', 'Customer ID', 'Customer Name', 'Customer Phone', 'Subtotal', 'Discount', 'Shipping', 'Tax', 'Total', 'Currency', 'Status', 'Channel', 'Priority', 'Shipping Method', 'Courier', 'Tracking #', 'Shipping Address', 'Est. Delivery', 'Notes', 'Order Date'],
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

    if (headers.length) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'A1',
        valueInputOption: 'RAW',
        resource: { values: [headers] },
      });
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
            {
              updateSheetProperties: {
                properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                fields: 'gridProperties.frozenRowCount',
              },
            },
          ],
        },
      });
    }

    if (folderId) {
      await this.drive.files.update({
        fileId: spreadsheetId,
        addParents: [folderId],
        fields: 'id',
      });
    }

    return spreadsheetId;
  }

  async appendRow(spreadsheetId, values) {
    await this.ensureValidToken();
    await this.sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [values] },
    });
  }

  async updateRow(spreadsheetId, rowIndex, values) {
    await this.ensureValidToken();
    const range = `A${rowIndex}`;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      resource: { values: [values] },
    });
  }

  async deleteRow(spreadsheetId, rowIndex) {
    await this.ensureValidToken();
    const sheetId = 0;
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex - 1,
                endIndex: rowIndex,
              },
            },
          },
        ],
      },
    });
  }

  async getSheetValues(spreadsheetId) {
    await this.ensureValidToken();
    const { data } = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A1:Z',
    });
    return data.values || [];
  }

  async getFolderIdFromLink(folderLink) {
    await this.ensureValidToken();
    const match = folderLink.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (!match) return null;
    const folderId = match[1];
    try {
      await this.drive.files.get({ fileId: folderId, fields: 'id' });
      return folderId;
    } catch {
      return null;
    }
  }

  async findOrCreateSubfolder(parentFolderId, subfolderName) {
    await this.ensureValidToken();
    const { data } = await this.drive.files.list({
      q: `'${parentFolderId}' in parents and name = '${subfolderName}' and mimeType = 'application/vnd.google-apps.folder'`,
      fields: 'files(id, name)',
    });

    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }

    const { data: newFolder } = await this.drive.files.create({
      resource: {
        name: subfolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      },
      fields: 'id',
    });

    return newFolder.id;
  }

  async listFilesInFolder(folderId) {
    await this.ensureValidToken();
    const { data } = await this.drive.files.list({
      q: `'${folderId}' in parents`,
      fields: 'files(id, name, mimeType)',
    });
    return data.files || [];
  }

  async getExcelValues(fileId) {
    await this.ensureValidToken();
    const { data } = await this.drive.files.get({
      fileId,
      alt: 'media',
    });
    const workbook = XLSX.read(data, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  }

  parseRowToModel(row, type) {
    const data = {};
    const headers = SPREADSHEET_HEADERS[type] || [];
    const map = {
      products: {
        'Product ID': 'productId', 'Name': 'name', 'Category': 'category',
        'Subcategory': 'subcategory', 'Collection': 'collection', 'Season': 'season',
        'Fabric': 'fabric', 'Cost Price': 'costPrice', 'Price': 'price',
        'Sale Price': 'salePrice', 'Currency': 'currency', 'SKU': 'sku',
        'Stock Qty': 'stockQty', 'Status': 'status', 'Tags': 'tags',
        'Image Path': 'imageLink', 'Supplier ID': 'supplierId', 'Created At': 'createdAt'
      },
      orders: {
        'Order ID': 'orderId', 'Customer ID': 'customerId', 'Customer Name': 'customerName',
        'Customer Phone': 'customerPhone', 'Subtotal': 'subtotal', 'Discount': 'discountAmount',
        'Shipping': 'shippingCost', 'Tax': 'taxAmount', 'Total': 'total',
        'Currency': 'currency', 'Status': 'status', 'Channel': 'channel',
        'Priority': 'priority', 'Shipping Method': 'shippingMethod', 'Courier': 'courier',
        'Tracking #': 'trackingNumber', 'Shipping Address': 'shippingAddress',
        'Est. Delivery': 'estimatedDelivery', 'Notes': 'notes', 'Order Date': 'orderDate'
      },
      customers: {
        'Customer ID': 'customerId', 'Full Name': 'name', 'Email': 'email',
        'Phone': 'phone', 'WhatsApp': 'whatsapp', 'City': 'city',
        'Country': 'country', 'Address': 'address', 'Gender': 'gender',
        'Segment': 'segment', 'Source': 'source', 'Total Spent': 'totalSpent',
        'Total Orders': 'totalOrders', 'Loyalty Points': 'loyaltyPoints',
        'Date Joined': 'dateJoined', 'Subscribed': 'subscribed', 'Tags': 'tags', 'Notes': 'notes'
      },
      financial: {
        'Transaction ID': 'transactionId', 'Order ID': 'orderId', 'Customer ID': 'customerId',
        'Customer Name': 'customerName', 'Order Status': 'orderStatus', 'Order Total': 'orderTotal',
        'Amount': 'amount', 'Payment Method': 'paymentMethod', 'Payment Status': 'paymentStatus',
        'Transaction Date': 'transactionDate'
      },
      suppliers: {
        'Supplier ID': 'supplierId', 'Name': 'name', 'Contact Person': 'contactPerson',
        'Email': 'email', 'Phone': 'phone', 'WhatsApp': 'whatsapp', 'City': 'city',
        'Country': 'country', 'Category': 'category', 'Materials': 'materials',
        'Rating': 'rating', 'Lead Time (Days)': 'leadTimeDays', 'Min Order': 'minimumOrder',
        'Payment Terms': 'paymentTerms', 'Active': 'isActive', 'Total Purchased': 'totalPurchased', 'Notes': 'notes'
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

  async uploadFileToDrive(folderId, fileName, mimeType, buffer) {
    await this.ensureValidToken();
    
    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };

    // Convert Buffer to a readable stream
    const { Readable } = require('stream');
    const bufferStream = new Readable();
    bufferStream.push(buffer);
    bufferStream.push(null);

    const media = {
      mimeType: mimeType,
      body: bufferStream,
    };

    try {
      const { data } = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, webViewLink, webContentLink',
      });
      
      return {
        id: data.id,
        webViewLink: data.webViewLink,
        webContentLink: data.webContentLink,
      };
    } catch (err) {
      console.error('Drive file upload error:', err.message);
      throw new Error(`Failed to upload file to Drive: ${err.message}`);
    }
  }
}

function syncAsync(fn) {
  fn().catch(err => console.error('Background sheets sync error:', err.message));
}

module.exports = { GoogleSheetsService, syncAsync };
