````markdown
# agents.md – PDFTron LWC + Connector Architecture (Google Drive First)

Goal:  
Create a **forked version** of the Apryse/PDFTron `webviewer-salesforce` LWC sample that:

1. **Abstracts file IO** (where docs come from & where edited docs go) into a **connector layer**.
2. Adds a **Google Drive connector**:
   - Uses **Google Picker** for “Open from Drive”.
   - Sends **saves/exports back to Drive**.
3. Keeps PDFTron/WebViewer usage intact and ready to add more connectors later (e.g. “Compliant Repo”).

Reference sample (clone this as the base): :contentReference[oaicite:0]{index=0}  
```bash
git clone https://github.com/ApryseSDK/webviewer-salesforce.git
# or
git clone https://github.com/PDFTron/webviewer-salesforce.git
````

---

## 0. Repo Layout (Target Shape)

You’re working inside a parent folder, e.g.:

```text
pdftron-connectors/
├── webviewer-salesforce/        # forked Apryse sample (Salesforce DX project)
└── (later) drive-backend/       # optional Python service for Drive uploads
```

Inside `webviewer-salesforce/force-app/main/default/lwc/` we’ll add:

```text
lwc/
  pdftronWvInstance/             # existing WebViewer instance LWC
  pdftronWvFileBrowserComponent/ # existing file browser LWC (if present)
  connectorRegistry/             # NEW – connector registry & interface
  connectorDrive/                # NEW – Google Drive connector
  connectorSalesforce/           # NEW – SF Files/Attachments connector
  connectorConfig/               # NEW – reads org config (optional)
```

---

## 1. Baseline: Get the Original Sample Running

1. **Clone & open** the repo.

   ```bash
   cd webviewer-salesforce
   ```

2. Follow Apryse docs to:

   * Download WebViewer.
   * Run `npm run optimize` for Salesforce. ([Apryse][1])
   * Copy resulting `.zip` static resources into:

     ```text
     force-app/main/default/staticresources/
     ```

3. Connect to your dev org:

   ```bash
   sfdx auth:web:login -a PdftronDev
   sfdx force:source:deploy -p force-app/main/default -u PdftronDev
   ```

4. In the org:

   * Add the `pdftronWvInstance` LWC to a Lightning page.
   * Confirm you can open example docs (standard sample behavior).

Only proceed once this works. This gives you a “known-good” baseline.

---

## 2. Design: Connector Abstraction

We want WebViewer to **not care** if a document came from Salesforce Files, Drive, or some future repo.

Define a **connector interface** in a shared JS module:

### 2.1. Connector Interface (JS)

Create `force-app/main/default/lwc/connectorRegistry/connectorRegistry.js`:

```js
// connectorRegistry.js

// Shape each connector should implement:
export class BaseConnector {
    // Return a list of files user can open (optional, for internal browsers)
    async listFiles(context) { throw new Error('Not implemented'); }

    // Given a file descriptor, return something WebViewer can load
    // Example: { url, headers } or { arrayBuffer, filename }
    async openFile(fileDescriptor, context) { throw new Error('Not implemented'); }

    // Called when saving or exporting from WebViewer
    // Example: save back to Drive or SF
    async saveFile(savePayload, context) { throw new Error('Not implemented'); }

    // Optional: “Pick file using native picker” (Drive Picker, etc)
    async pickFile(context) { throw new Error('Not implemented'); }
}

// Registry keyed by connector ID
const registry = {};

/**
 * Register a connector implementation.
 * connectorId: e.g. "salesforce", "gdrive", "compliantRepo"
 */
export function registerConnector(connectorId, connectorInstance) {
    registry[connectorId] = connectorInstance;
}

/**
 * Get registered connector by ID.
 */
export function getConnector(connectorId) {
    return registry[connectorId];
}

/**
 * Fallback or default connector id.
 * For now, default to Salesforce; override from org config later.
 */
export const DEFAULT_CONNECTOR_ID = 'salesforce';
```

Later, you’ll:

* Import `registerConnector` in connector LWCs.
* Import `getConnector` in `pdftronWvInstance`.

---

## 3. Implement Salesforce Connector (Existing Behavior Wrapped)

We’ll wrap current “open Salesforce file” behavior into a **Salesforce connector**.

Create `force-app/main/default/lwc/connectorSalesforce/connectorSalesforce.js`:

```js
import { BaseConnector, registerConnector } from 'c/connectorRegistry';
import getFileContent from '@salesforce/apex/PdftronFileController.getFileContent';

class SalesforceConnector extends BaseConnector {
    async listFiles(context) {
        // Optional: implement using Apex to list ContentDocuments by RecordId
        return [];
    }

    async openFile(fileDescriptor, context) {
        // fileDescriptor: { contentDocumentId, fileName }
        const { contentDocumentId, fileName } = fileDescriptor;

        // Example Apex method that returns base64 content string
        const base64Data = await getFileContent({ contentDocumentId });

        // WebViewer can open ArrayBuffer directly
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);

        return {
            arrayBuffer: byteArray.buffer,
            filename: fileName
        };
    }

    async saveFile(savePayload, context) {
        // savePayload: { arrayBuffer, filename, recordId? }
        // Implement later if you want edited docs saved as Salesforce Files
        return;
    }
}

registerConnector('salesforce', new SalesforceConnector());
```

> Note: adapt `getFileContent` to match your existing Apex (if the sample repo uses a different method/controller name, follow that pattern).

---

## 4. Implement Google Drive Connector

We want:

* `pickFile()` → opens **Google Picker** → returns `fileDescriptor` (fileId, name, download URL).
* `openFile()` → returns something WebViewer can load, using a **download URL + auth header**.
* `saveFile()` → sends edits back to Drive (via direct Drive API or backend microservice).

### 4.1. Google Cloud Setup (Once)

1. Go to Google Cloud Console:

   * Create a project `pdftron-drive-integration`.
   * Enable:

     * **Google Drive API**
     * **Google Picker API**

2. Create an OAuth 2.0 client:

   * Type: **Web application**.
   * Authorized JavaScript origins: your Salesforce domain, e.g.

     * `https://yourInstance.lightning.force.com`
     * `https://yourDomain.my.salesforce.com`
   * Get **Client ID** and **API key**.

3. Store these in Salesforce:

   * Option A: **Custom Metadata Type** `Connector_Config__mdt` with fields:

     * `ConnectorId__c` (Text) – e.g. `gdrive`
     * `Client_Id__c`
     * `Api_Key__c`
   * Option B: Custom Settings / Named Credential (for server-side flows).

For **front-end-only** POC, you can keep Client ID/API key in the LWC as constants, but for real orgs, read from Apex.

### 4.2. Static Resource for Google APIs

You can load `gapi` and Picker from Google directly, but to avoid CSP issues, you may want to load them as static scripts. For now, simplest approach:

In `pdftronWvInstance` LWC:

```js
// example snippet
loadScript(this, 'https://apis.google.com/js/api.js')
    .then(() => {
        // gapi loaded
    });
```

If that hits CSP headaches, you’ll wrap via a static resource, but for agent purposes, assume remote load is allowed.

### 4.3. LWC: Drive Connector Implementation

Create `force-app/main/default/lwc/connectorDrive/connectorDrive.js`:

```js
import { BaseConnector, registerConnector } from 'c/connectorRegistry';

// Optional: fetch config from Apex
// import getDriveConfig from '@salesforce/apex/ConnectorConfigController.getDriveConfig';

class DriveConnector extends BaseConnector {
    constructor() {
        super();
        // Ideally these come from Apex; hard-coded here for clarity
        this.clientId = 'YOUR_GOOGLE_CLIENT_ID';
        this.apiKey   = 'YOUR_GOOGLE_API_KEY';
        this.appId    = 'YOUR_GOOGLE_APP_ID'; // optional, for Picker
        this.scope    = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';

        this.gapiLoaded = false;
        this.authToken  = null;
    }

    async ensureGapiLoaded() {
        if (this.gapiLoaded) return;

        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = () => {
                window.gapi.load('client:picker', () => {
                    this.gapiLoaded = true;
                    resolve();
                });
            };
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }

    async ensureAuthorized() {
        await this.ensureGapiLoaded();

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
    }

    async pickFile(context) {
        await this.ensureAuthorized();

        return new Promise((resolve, reject) => {
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
        });
    }

    async openFile(fileDescriptor, context) {
        await this.ensureAuthorized();

        const { fileId, name } = fileDescriptor;

        // Get file metadata to obtain downloadUrl or webContentLink
        const fileResp = await window.gapi.client.drive.files.get({
            fileId,
            fields: 'id,name,mimeType,webContentLink'
        });

        const webContentLink = fileResp.result.webContentLink;

        // WebViewer can open a URL, and you can pass custom headers (e.g. auth) if needed. :contentReference[oaicite:2]{index=2}
        return {
            url: webContentLink,
            filename: name,
            headers: {
                Authorization: `Bearer ${this.authToken}`
            }
        };
    }

    async saveFile(savePayload, context) {
        // For full Drive integration, consider moving uploads to a backend for security.
        // But basic direct-from-browser upload looks like:
        //
        // savePayload: { arrayBuffer, filename, mimeType?, fileId? }

        await this.ensureAuthorized();

        const { arrayBuffer, filename, mimeType, fileId } = savePayload;

        const blob = new Blob([arrayBuffer], { type: mimeType || 'application/pdf' });

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
    }
}

registerConnector('gdrive', new DriveConnector());
```

> For production, you’d replace direct client-side Drive API usage with a backend microservice that takes a short-lived token or org/user context. For now, agents prioritize a working integration.

---

## 5. Wiring Connectors into `pdftronWvInstance`

Find the main WebViewer LWC, typically `force-app/main/default/lwc/pdftronWvInstance/pdftronWvInstance.js`.

### 5.1. Load Connectors

At the top of `pdftronWvInstance.js`:

```js
import { LightningElement, api, track } from 'lwc';
import WebViewer from '@salesforce/resourceUrl/webviewer'; // or similar
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import { getConnector, DEFAULT_CONNECTOR_ID } from 'c/connectorRegistry';
import 'c/connectorSalesforce';
import 'c/connectorDrive';
```

By importing `connectorSalesforce` and `connectorDrive`, they self-register in the registry.

### 5.2. Choose Active Connector

Add a tracked property and a switcher (eventually driven by org config):

```js
@track activeConnectorId = DEFAULT_CONNECTOR_ID;

get activeConnector() {
    return getConnector(this.activeConnectorId);
}
```

For now, you can hard-code `activeConnectorId = 'gdrive'` to test.

### 5.3. Hook into WebViewer’s Open/Save Actions

In the existing `connectedCallback` or WebViewer initialization, you likely have something like:

```js
WebViewer(
    {
        path: webviewerPath,
        initialDoc: ...
    },
    this.template.querySelector('.webviewer')
).then(instance => {
    this.wvInstance = instance;
    // existing code...
});
```

Modify to:

```js
WebViewer(
    {
        path: webviewerPath
    },
    this.template.querySelector('.webviewer')
).then(async instance => {
    this.wvInstance = instance;

    // Override default open button to use connector
    instance.UI.setHeaderItems(header => {
        header.push({
            type: 'actionButton',
            img: 'icon-header-open', // or any icon
            title: 'Open from Connector',
            onClick: () => this.handleOpenFromConnector()
        });

        header.push({
            type: 'actionButton',
            img: 'icon-header-save',
            title: 'Save to Connector',
            onClick: () => this.handleSaveToConnector()
        });
    });

    // Optionally: if you have a default Record file, open via connectorSalesforce here
});
```

Add methods inside the LWC class:

```js
async handleOpenFromConnector() {
    const connector = this.activeConnector;
    if (!connector) return;

    // Step 1: ask connector for a file
    const descriptor = await connector.pickFile({ recordId: this.recordId });
    if (!descriptor) return;

    const filePayload = await connector.openFile(descriptor, { recordId: this.recordId });

    // filePayload can be { url, headers } or { arrayBuffer, filename }
    const instance = this.wvInstance;
    const docOptions = {};

    if (filePayload.headers) {
        docOptions.customHeaders = filePayload.headers;
    }

    if (filePayload.url) {
        instance.UI.loadDocument(filePayload.url, {
            filename: filePayload.filename,
            ...docOptions
        });
    } else if (filePayload.arrayBuffer) {
        instance.UI.loadDocument(filePayload.arrayBuffer, {
            filename: filePayload.filename
        });
    }

    // Store descriptor for saves (Drive fileId, etc)
    this.currentFileDescriptor = descriptor;
}

async handleSaveToConnector() {
    const connector = this.activeConnector;
    if (!connector || !this.wvInstance) return;

    const doc = this.wvInstance.Core.documentViewer.getDocument();
    if (!doc) return;

    const xfdf = await this.wvInstance.Core.annotationManager.exportAnnotations();
    const data = await doc.getFileData({
        xfdfString: xfdf
    });

    const array = new Uint8Array(data);
    const filename = this.currentFileDescriptor?.name || 'edited.pdf';

    const savePayload = {
        arrayBuffer: array.buffer,
        filename,
        mimeType: 'application/pdf',
        fileId: this.currentFileDescriptor?.fileId
    };

    const resp = await connector.saveFile(savePayload, { recordId: this.recordId });
    // Optionally show a toast with resp.id or resp.webViewLink
}
```

Now **any connector** that implements `pickFile`, `openFile`, `saveFile` can be swapped in.

---

## 6. Making Google Drive the Primary “Upload/Download” Path

For a company “living in Drive but disorganized,” you want:

* Any “Upload” or “Open” button → **Drive Picker**.
* Any “Save” → Document ends up **back in Drive** (not buried in SF Files).

### 6.1. Default Connector: Drive

You can make Drive the default in `connectorRegistry.js`:

```js
export const DEFAULT_CONNECTOR_ID = 'gdrive';
```

Or derive it from custom metadata via Apex:

* `Connector_Config__mdt` with fields:

  * `Org_Default_Connector__c` (“salesforce” / “gdrive” / “compliantRepo”).
* `ConnectorConfigController.getDefaultConnector()` returns that string.
* In `pdftronWvInstance`:

```js
@wire(getDefaultConnector) wiredConfig({ data, error }) {
    if (data) {
        this.activeConnectorId = data;
    }
}
```

### 6.2. Where to Place “Open from Drive” Button

You have two UX choices:

1. **Primary button:** always show “Open from Google Drive” in WebViewer header (what we did in `setHeaderItems`).
2. **Source selector:** small LWC UI above WebViewer with a picklist:

   ```html
   <lightning-combobox
     label="Source"
     value={activeConnectorId}
     options={connectorOptions}
     onchange={handleConnectorChange}>
   </lightning-combobox>
   ```

   `connectorOptions` = `[ { label: 'Salesforce', value: 'salesforce' }, { label: 'Google Drive', value: 'gdrive' } ]`.

   Then `handleConnectorChange` updates `activeConnectorId`.

---

## 7. Prepping for “Compliant Repo” Connector

Future-proofing:

* Define another connector skeleton, e.g. `connectorCompliantRepo.js`, using the same interface:

  ```js
  import { BaseConnector, registerConnector } from 'c/connectorRegistry';

  class CompliantRepoConnector extends BaseConnector {
      async pickFile(context) { /* call backend / search repo */ }
      async openFile(fileDescriptor, context) { /* return { url, headers } */ }
      async saveFile(savePayload, context) { /* handle secure upload */ }
  }

  registerConnector('compliantRepo', new CompliantRepoConnector());
  ```
* At that point, your LWC doesn’t change: you just add another connector and allow it in org config.

This is why we pushed the **connector abstraction** up front.

---

## 8. (Optional) Drive Backend Microservice

For **real** compliance/security, you won’t want full Drive scope sitting in the browser.

You can:

1. Create a `drive-backend/` folder with a Python FastAPI service:

   * `/gdrive/pick-token` – handles OAuth server-side.
   * `/gdrive/upload` – receives file bytes from Salesforce, uploads to Drive under a service account.
   * `/gdrive/generate-download-url` – returns a signed URL + headers WebViewer can open.

2. Salesforce side:

   * Apex callouts to backend using Named Credential `Drive_Backend`.
   * LWC calls Apex instead of Google APIs directly.

The connector interface **stays** the same; only implementation changes.

---

## 9. Validation Checklist

When this agent’s instructions are implemented, you should be able to:

1. **Deploy** modified `webviewer-salesforce` to a dev org.
2. Place `pdftronWvInstance` on a Lightning page.
3. See custom header buttons:

   * “Open from Connector”
   * “Save to Connector”
4. With **Drive as active connector**:

   * Clicking “Open from Connector” launches **Google Picker**.
   * Selecting a PDF loads it into WebViewer.
   * Adding annotations and clicking “Save to Connector” uploads back to Drive.
5. With **Salesforce as active connector**:

   * Same UI, but files open from Salesforce Files instead.

At that point you’ve:

* **Abstracted PDFTron/WebViewer I/O** via connectors.
* Integrated **Drive via Google Picker** on upload/open.
* Supported **Drive as the destination** for outputs (edited docs).
* Built a pattern that can easily be extended to a **compliant repo**.

This is the baseline “connectorized” WebViewer LWC you can clone, extend, and sell into firms drowning in Google Drive chaos.

```
::contentReference[oaicite:3]{index=3}
```

[1]: https://apryse.com/blog/webviewer/add-pdf-viewer-editor-to-salesforce-as-lwc-v2?utm_source=chatgpt.com "How to Open & Edit PDF or Office in Salesforce LWC"
