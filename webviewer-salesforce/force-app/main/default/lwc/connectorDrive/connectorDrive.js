import { BaseConnector, registerConnector } from 'c/connectorRegistry';

class DriveConnector extends BaseConnector {
    constructor() {
        super();
        // Ideally these come from Apex; hard-coded here for clarity
        // TODO: Replace with actual Google Cloud credentials
        this.clientId = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
        this.apiKey   = 'YOUR_GOOGLE_API_KEY';
        this.appId    = 'YOUR_GOOGLE_APP_ID'; // optional, for Picker
        this.scope    = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';

        this.gapiLoaded = false;
        this.pickerLoaded = false;
        this.authToken  = null;
    }

    async ensureGapiLoaded() {
        if (this.gapiLoaded) return;

        return new Promise((resolve, reject) => {
            // Check if gapi is already loaded
            if (window.gapi) {
                window.gapi.load('client:auth2', () => {
                    this.gapiLoaded = true;
                    resolve();
                });
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = () => {
                window.gapi.load('client:auth2', () => {
                    this.gapiLoaded = true;
                    resolve();
                });
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async ensurePickerLoaded() {
        if (this.pickerLoaded) return;

        return new Promise((resolve, reject) => {
            // Check if picker is already loaded
            if (window.google && window.google.picker) {
                this.pickerLoaded = true;
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js?onload=onPickerApiLoad';
            window.onPickerApiLoad = () => {
                window.gapi.load('picker', () => {
                    this.pickerLoaded = true;
                    resolve();
                });
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async ensureAuthorized() {
        await this.ensureGapiLoaded();

        try {
            await window.gapi.client.init({
                apiKey: this.apiKey,
                clientId: this.clientId,
                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
                scope: this.scope
            });

            const authInstance = window.gapi.auth2.getAuthInstance();
            if (!authInstance.isSignedIn.get()) {
                await authInstance.signIn();
            }
            const user = authInstance.currentUser.get();
            const authResponse = user.getAuthResponse(true);
            this.authToken = authResponse.access_token;
        } catch (error) {
            console.error('Error during Google Drive authorization:', error);
            throw error;
        }
    }

    async pickFile(context) {
        await this.ensureAuthorized();
        await this.ensurePickerLoaded();

        return new Promise((resolve, reject) => {
            try {
                const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
                    .setIncludeFolders(true)
                    .setSelectFolderEnabled(false);

                const picker = new google.picker.PickerBuilder()
                    .setAppId(this.appId)
                    .setOAuthToken(this.authToken)
                    .setDeveloperKey(this.apiKey)
                    .addView(view)
                    .setCallback((data) => {
                        if (data.action === google.picker.Action.PICKED) {
                            const doc = data.docs[0];
                            // Build a file descriptor understood by this connector
                            const fileDescriptor = {
                                connectorId: 'gdrive',
                                fileId: doc.id,
                                name: doc.name,
                                mimeType: doc.mimeType
                            };
                            resolve(fileDescriptor);
                        } else if (data.action === google.picker.Action.CANCEL) {
                            resolve(null);
                        }
                    })
                    .build();

                picker.setVisible(true);
            } catch (error) {
                reject(error);
            }
        });
    }

    async openFile(fileDescriptor, context) {
        await this.ensureAuthorized();

        const { fileId, name } = fileDescriptor;

        try {
            // Get file metadata to obtain downloadUrl or webContentLink
            const fileResp = await window.gapi.client.drive.files.get({
                fileId,
                fields: 'id,name,mimeType,webContentLink',
                alt: 'media'
            });

            // For PDFs and other supported formats, we can get the file content directly
            // Use the Drive API to download the file content
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
                {
                    headers: {
                        Authorization: `Bearer ${this.authToken}`
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to download file from Drive: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();

            return {
                arrayBuffer: arrayBuffer,
                filename: name,
                fileId: fileId
            };
        } catch (error) {
            console.error('Error opening file from Drive:', error);
            throw error;
        }
    }

    async saveFile(savePayload, context) {
        // For full Drive integration, consider moving uploads to a backend for security.
        // But basic direct-from-browser upload looks like:
        //
        // savePayload: { arrayBuffer, filename, mimeType?, fileId? }

        await this.ensureAuthorized();

        const { arrayBuffer, filename, mimeType, fileId } = savePayload;

        const blob = new Blob([arrayBuffer], { type: mimeType || 'application/pdf' });

        try {
            // Simple case: create new file in Drive root
            const metadata = {
                name: filename,
                mimeType: mimeType || 'application/pdf'
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', blob);

            const uploadUrl = fileId
                ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
                : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

            const res = await fetch(uploadUrl, {
                method: fileId ? 'PATCH' : 'POST',
                headers: new Headers({ Authorization: `Bearer ${this.authToken}` }),
                body: form
            });

            if (!res.ok) {
                throw new Error('Failed to upload file to Drive');
            }

            return await res.json(); // Contains id, name, etc.
        } catch (error) {
            console.error('Error saving file to Drive:', error);
            throw error;
        }
    }
}

// Auto-register the Drive connector when this module is imported
registerConnector('gdrive', new DriveConnector());
