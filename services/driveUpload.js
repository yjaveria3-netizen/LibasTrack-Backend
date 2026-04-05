const { google } = require('googleapis');
const { Readable } = require('stream');

class DriveUploadService {
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
    this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
  }

  // Find or create a subfolder inside a parent folder
  async findOrCreateFolder(parentFolderId, folderName) {
    try {
      const res = await this.drive.files.list({
        q: `'${parentFolderId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)'
      });
      if (res.data.files.length > 0) return res.data.files[0].id;

      const folder = await this.drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentFolderId]
        },
        fields: 'id'
      });
      return folder.data.id;
    } catch (err) {
      console.error('Error finding/creating folder:', err.message);
      throw err;
    }
  }

  // Upload image buffer to a Drive folder, return public view URL
  async uploadImage(buffer, originalName, mimeType, folderId) {
    try {
      // Convert buffer to readable stream
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);

      const res = await this.drive.files.create({
        requestBody: {
          name: originalName,
          parents: [folderId],
          mimeType: mimeType
        },
        media: {
          mimeType: mimeType,
          body: stream
        },
        fields: 'id, name, webViewLink, webContentLink'
      });

      const fileId = res.data.id;

      // Make file publicly readable
      await this.drive.permissions.create({
        fileId,
        requestBody: { role: 'reader', type: 'anyone' }
      });

      // Return direct thumbnail-friendly link
      const viewUrl = `https://drive.google.com/file/d/${fileId}/view`;
      const directUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;

      return { fileId, viewUrl, directUrl, name: res.data.name };
    } catch (err) {
      console.error('Drive upload error:', err.message);
      throw err;
    }
  }

  // Delete a file from Drive
  async deleteFile(fileId) {
    try {
      await this.drive.files.delete({ fileId });
    } catch (err) {
      console.error('Drive delete error:', err.message);
    }
  }
}

module.exports = DriveUploadService;