const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

/**
 * Fast non-blocking Excel sync service for local mode.
 * Fires-and-forgets — does not await in routes to keep API fast.
 */
class ExcelService {
  constructor(localPath) {
    this.localPath = localPath;
  }

  _filePath(filename) {
    return path.join(this.localPath, 'Database', filename);
  }

  async _loadWorkbook(filename) {
    const wb = new ExcelJS.Workbook();
    const fp = this._filePath(filename);
    if (fs.existsSync(fp)) {
      await wb.xlsx.readFile(fp);
    }
    return wb;
  }

  async _save(wb, filename) {
    await wb.xlsx.writeFile(this._filePath(filename));
  }

  _findRow(ws, colIndex, value) {
    let found = null;
    ws.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && row.getCell(colIndex).value === value) {
        found = rowNumber;
      }
    });
    return found;
  }

  async upsertProduct(product) {
    try {
      const wb = await this._loadWorkbook('Products.xlsx');
      const ws = wb.getWorksheet('Products') || wb.addWorksheet('Products');
      const values = [
        product.productId, product.name, product.category, product.subcategory || '',
        product.collection || '', product.season || '', product.fabric || '',
        product.costPrice || 0, product.price, product.salePrice || '',
        product.currency || 'PKR', product.sku || '', product.stockQty || 0,
        product.status, (product.tags || []).join(', '), product.imageLink || '',
        new Date(product.createdAt).toLocaleDateString(),
      ];
      const existing = this._findRow(ws, 1, product.productId);
      if (existing) {
        ws.getRow(existing).values = ['', ...values]; // ExcelJS is 1-indexed
      } else {
        ws.addRow(values);
      }
      await this._save(wb, 'Products.xlsx');
    } catch (e) { console.error('Excel product sync error:', e.message); }
  }

  async upsertOrder(order) {
    try {
      const wb = await this._loadWorkbook('Orders.xlsx');
      const ws = wb.getWorksheet('Orders') || wb.addWorksheet('Orders');
      const values = [
        order.orderId, order.customerId, order.customerName || '', order.customerPhone || '',
        order.subtotal, order.discountAmount || 0, order.shippingCost || 0, order.taxAmount || 0,
        order.total, order.currency || 'PKR', order.status, order.channel || '',
        order.priority || 'Normal', order.shippingMethod || '', order.courierName || '',
        order.trackingNumber || '', order.shippingAddress || '',
        order.estimatedDelivery ? new Date(order.estimatedDelivery).toLocaleDateString() : '',
        order.notes || '',
        new Date(order.orderDate).toLocaleDateString(),
      ];
      const existing = this._findRow(ws, 1, order.orderId);
      if (existing) { ws.getRow(existing).values = ['', ...values]; }
      else { ws.addRow(values); }
      await this._save(wb, 'Orders.xlsx');
    } catch (e) { console.error('Excel order sync error:', e.message); }
  }

  async upsertCustomer(customer) {
    try {
      const wb = await this._loadWorkbook('Customers.xlsx');
      const ws = wb.getWorksheet('Customers') || wb.addWorksheet('Customers');
      const values = [
        customer.customerId, customer.fullName, customer.email || '', customer.phone || '',
        customer.whatsapp || '', customer.city || '', customer.country || '',
        customer.address || '', customer.gender || '', customer.segment || '',
        customer.source || '', customer.totalSpent || 0, customer.totalOrders || 0,
        customer.loyaltyPoints || 0,
        customer.dateJoined ? new Date(customer.dateJoined).toLocaleDateString() : '',
        customer.isSubscribed ? 'Yes' : 'No',
        (customer.tags || []).join(', '), customer.notes || '',
      ];
      const existing = this._findRow(ws, 1, customer.customerId);
      if (existing) { ws.getRow(existing).values = ['', ...values]; }
      else { ws.addRow(values); }
      await this._save(wb, 'Customers.xlsx');
    } catch (e) { console.error('Excel customer sync error:', e.message); }
  }

  async upsertTransaction(txn) {
    try {
      const wb = await this._loadWorkbook('Financial.xlsx');
      const ws = wb.getWorksheet('Transactions') || wb.addWorksheet('Transactions');
      const values = [
        txn.transactionId, txn.orderId, txn.customerId || '', txn.customerName || '',
        txn.orderStatus || '', txn.orderTotal || 0, txn.price,
        txn.paymentMethod, txn.paymentStatus,
        new Date(txn.transactionDate || txn.createdAt).toLocaleDateString(),
      ];
      const existing = this._findRow(ws, 1, txn.transactionId);
      if (existing) { ws.getRow(existing).values = ['', ...values]; }
      else { ws.addRow(values); }
      await this._save(wb, 'Financial.xlsx');
    } catch (e) { console.error('Excel financial sync error:', e.message); }
  }

  async upsertReturn(ret) {
    try {
      const wb = await this._loadWorkbook('Returns.xlsx');
      const ws = wb.getWorksheet('Returns') || wb.addWorksheet('Returns');
      const values = [
        ret.returnId, ret.orderId, ret.customerId || '', ret.customerName || '',
        ret.productId || '', ret.productName || '', ret.reason || '', ret.type || '',
        ret.status || '', ret.refundAmount || 0,
        new Date(ret.requestDate || ret.createdAt).toLocaleDateString(),
        ret.notes || '',
      ];
      const existing = this._findRow(ws, 1, ret.returnId);
      if (existing) { ws.getRow(existing).values = ['', ...values]; }
      else { ws.addRow(values); }
      await this._save(wb, 'Returns.xlsx');
    } catch (e) { console.error('Excel returns sync error:', e.message); }
  }

  async upsertSupplier(supplier) {
    try {
      const wb = await this._loadWorkbook('Suppliers.xlsx');
      const ws = wb.getWorksheet('Suppliers') || wb.addWorksheet('Suppliers');
      const values = [
        supplier.supplierId, supplier.name, supplier.contactPerson || '',
        supplier.email || '', supplier.phone || '', supplier.whatsapp || '',
        supplier.city || '', supplier.country || '', supplier.category || '',
        (supplier.materials || []).join(', '), supplier.rating || '',
        supplier.leadTimeDays || '', supplier.minimumOrder || '',
        supplier.paymentTerms || '', supplier.isActive ? 'Yes' : 'No',
        supplier.totalPurchased || 0, supplier.notes || '',
      ];
      const existing = this._findRow(ws, 1, supplier.supplierId);
      if (existing) { ws.getRow(existing).values = ['', ...values]; }
      else { ws.addRow(values); }
      await this._save(wb, 'Suppliers.xlsx');
    } catch (e) { console.error('Excel supplier sync error:', e.message); }
  }

  async deleteRow(filename, sheetName, colIndex, idValue) {
    try {
      const wb = await this._loadWorkbook(filename);
      const ws = wb.getWorksheet(sheetName);
      if (!ws) return;
      const rowNum = this._findRow(ws, colIndex, idValue);
      if (rowNum) ws.spliceRows(rowNum, 1);
      await this._save(wb, filename);
    } catch (e) { console.error('Excel delete row error:', e.message); }
  }
}

module.exports = ExcelService;