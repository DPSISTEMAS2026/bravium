import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GoogleDriveService {
    private readonly logger = new Logger(GoogleDriveService.name);

    private async getGoogleApis() {
        const { google } = await import('googleapis');
        return google;
    }

    /**
     * Downloads all files from the configured Google Drive folder.
     * @returns Array of file name and content (as stream or buffer)
     */
    async downloadFolderContents(folderId: string): Promise<any[]> {
        const credentialsJson = process.env.GOOGLE_DRIVE_CREDENTIALS_JSON;

        if (!credentialsJson) {
            this.logger.warn('GOOGLE_DRIVE_CREDENTIALS_JSON no configuradas. Saltando descarga de Drive.');
            return [];
        }

        try {
            const google = await this.getGoogleApis();
            const credentials = JSON.parse(credentialsJson);
            const auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/drive.readonly'],
            });

            const drive = google.drive({ version: 'v3', auth });

            this.logger.log(`Listando archivos en Folder ID: ${folderId}`);

            const response = await drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: 'files(id, name, mimeType)',
            });

            const files = response.data.files || [];
            this.logger.log(`Se encontraron ${files.length} archivos en total en la carpeta.`);

            for (const f of files) {
                this.logger.debug(`Archivo encontrado: ${f.name} (MimeType: ${f.mimeType})`);
            }

            const results = [];

            for (const file of files) {
                if (
                    file.mimeType === 'application/pdf' ||
                    file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                    file.mimeType === 'application/vnd.ms-excel' ||
                    file.mimeType === 'text/csv'
                ) {
                    this.logger.log(`Intentando descargar: ${file.name} (${file.mimeType})`);

                    try {
                        const fileResponse = await drive.files.get(
                            { fileId: file.id, alt: 'media' },
                            { responseType: 'arraybuffer' }
                        );

                        const buffer = Buffer.from(fileResponse.data as ArrayBuffer);
                        results.push({
                            name: file.name,
                            contentBase64: buffer.toString('base64'),
                            mimeType: file.mimeType
                        });
                    } catch (e) {
                        this.logger.error(`Error descargando ${file.name}: ${e.message}`);
                    }
                }
            }

            return results;

        } catch (error) {
            this.logger.error('Error accediendo a Google Drive API:', error);
            throw error;
        }
    }
}
