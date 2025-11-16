# Implementation Guide: Connector Architecture

This document provides detailed technical information about the connector architecture implementation.

## Architecture Pattern

### Connector Interface (BaseConnector)

All connectors must extend the `BaseConnector` class and implement the following methods:

```javascript
class BaseConnector {
    async listFiles(context) { }
    async openFile(fileDescriptor, context) { }
    async saveFile(savePayload, context) { }
    async pickFile(context) { }
}
```

### Method Contracts

#### `listFiles(context)`
**Purpose**: Return a list of available files (optional, for internal browsers)

**Parameters**:
- `context`: Object containing:
  - `recordId`: Current Salesforce record ID (if on a record page)

**Returns**: `Promise<Array<FileDescriptor>>`
- Array of file descriptor objects

**Example**:
```javascript
async listFiles(context) {
    return [
        { id: '123', name: 'document.pdf', mimeType: 'application/pdf' },
        { id: '456', name: 'report.xlsx', mimeType: 'application/vnd.ms-excel' }
    ];
}
```

#### `pickFile(context)`
**Purpose**: Open a file picker UI and return the selected file descriptor

**Parameters**:
- `context`: Object containing:
  - `recordId`: Current Salesforce record ID (if on a record page)

**Returns**: `Promise<FileDescriptor|null>`
- FileDescriptor object if file selected
- `null` if user cancelled

**Example**:
```javascript
async pickFile(context) {
    // Open Google Picker, Salesforce modal, etc.
    // Return descriptor of selected file
    return {
        connectorId: 'gdrive',
        fileId: 'abc123',
        name: 'selected-file.pdf',
        mimeType: 'application/pdf'
    };
}
```

#### `openFile(fileDescriptor, context)`
**Purpose**: Given a file descriptor, return file data that WebViewer can load

**Parameters**:
- `fileDescriptor`: Object describing the file (from `pickFile()` or `listFiles()`)
- `context`: Additional context (recordId, etc.)

**Returns**: `Promise<FilePayload>`

**FilePayload Options**:

Option 1 - ArrayBuffer (recommended):
```javascript
{
    arrayBuffer: ArrayBuffer,
    filename: string,
    fileId?: string  // Optional, for tracking
}
```

Option 2 - URL (advanced):
```javascript
{
    url: string,
    filename: string,
    headers?: Object,  // Optional auth headers
    fileId?: string
}
```

**Example**:
```javascript
async openFile(fileDescriptor, context) {
    const response = await fetch(`/api/files/${fileDescriptor.fileId}`);
    const arrayBuffer = await response.arrayBuffer();
    
    return {
        arrayBuffer: arrayBuffer,
        filename: fileDescriptor.name,
        fileId: fileDescriptor.fileId
    };
}
```

#### `saveFile(savePayload, context)`
**Purpose**: Save the edited document back to the file source

**Parameters**:
- `savePayload`: Object containing:
  - `arrayBuffer`: ArrayBuffer of the document data
  - `filename`: string
  - `mimeType`: string (usually 'application/pdf')
  - `fileId`: string (optional, for updates vs. new files)
- `context`: Additional context

**Returns**: `Promise<SaveResult>`
- SaveResult should contain at minimum: `{ id: string, success: boolean }`

**Example**:
```javascript
async saveFile(savePayload, context) {
    const { arrayBuffer, filename, mimeType, fileId } = savePayload;
    const blob = new Blob([arrayBuffer], { type: mimeType });
    
    const formData = new FormData();
    formData.append('file', blob, filename);
    
    const response = await fetch('/api/files/' + (fileId || ''), {
        method: fileId ? 'PUT' : 'POST',
        body: formData
    });
    
    return await response.json();
}
```

## Connector Registry

### Registration

Connectors self-register when imported:

```javascript
// In connectorDrive.js
class DriveConnector extends BaseConnector {
    // ... implementation
}

registerConnector('gdrive', new DriveConnector());
```

### Retrieval

Access connectors via the registry:

```javascript
import { getConnector } from 'c/connectorRegistry';

const connector = getConnector('gdrive');
const file = await connector.pickFile({ recordId: this.recordId });
```

## Integration with pdftronWvInstance

### Connector Selection

The active connector is determined by `activeConnectorId`:

```javascript
@track activeConnectorId = DEFAULT_CONNECTOR_ID;

get activeConnector() {
    return getConnector(this.activeConnectorId);
}
```

### Opening Files

```javascript
async handleOpenFromConnector() {
    const connector = this.activeConnector;
    
    // Step 1: Pick file
    const descriptor = await connector.pickFile({ recordId: this.recordId });
    if (!descriptor) return;
    
    // Step 2: Open file
    const filePayload = await connector.openFile(descriptor, { recordId: this.recordId });
    
    // Step 3: Load into WebViewer
    if (filePayload.arrayBuffer) {
        const blob = new Blob([filePayload.arrayBuffer], { type: 'application/pdf' });
        this.iframeWindow.postMessage({ 
            type: 'OPEN_DOCUMENT_BLOB', 
            payload: { blob, filename: filePayload.filename }
        }, '*');
    }
    
    // Store for saving
    this.currentFileDescriptor = descriptor;
}
```

### Saving Files

```javascript
async handleSaveToConnector() {
    const connector = this.activeConnector;
    
    // Request document data from WebViewer (via postMessage)
    this.iframeWindow.postMessage({ type: 'REQUEST_SAVE_TO_CONNECTOR' }, '*');
    
    // Handle response in message listener:
    // const savePayload = { arrayBuffer, filename, mimeType, fileId };
    // const result = await connector.saveFile(savePayload, { recordId });
}
```

## Connector Implementations

### Salesforce Connector

**File Source**: Salesforce ContentVersion objects

**Key Features**:
- Uses existing Apex controller (`PDFTron_ContentVersionController`)
- Converts base64 to ArrayBuffer
- Integrates with existing file browser

**Limitations**:
- `pickFile()` not implemented (uses existing UI)
- Relies on pubsub events for file selection

**Usage**:
```javascript
// Automatically registered when imported
import 'c/connectorSalesforce';

// Use existing file browser component for file selection
```

### Google Drive Connector

**File Source**: Google Drive via REST API

**Key Features**:
- Google Picker for file selection
- OAuth 2.0 authentication
- Direct browser-to-Drive communication
- Support for read and write operations

**Configuration Required**:
- Google Cloud Project
- OAuth 2.0 Client ID
- API Key
- Enabled APIs: Drive API, Picker API

**Usage**:
```javascript
import 'c/connectorDrive';

// Set as active connector
this.activeConnectorId = 'gdrive';

// User will be prompted to authenticate on first use
```

**Authentication Flow**:
1. User clicks "Open from Drive"
2. Connector loads Google APIs
3. `gapi.auth2` prompts for sign-in
4. User authorizes application
5. Access token stored for API calls
6. Picker opens with authenticated session

**API Calls**:

Get file list:
```javascript
await window.gapi.client.drive.files.list({
    pageSize: 10,
    fields: 'files(id, name, mimeType)'
});
```

Download file:
```javascript
const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
);
```

Upload file:
```javascript
const formData = new FormData();
formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
formData.append('file', blob);

await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
});
```

### Compliant Repo Connector (Skeleton)

**Purpose**: Template for future secure repository integration

**Features to Implement**:
- Backend service integration
- Enhanced security (server-side auth)
- Audit logging
- Access control
- Encryption at rest

**Example Backend Architecture**:
```
Salesforce LWC
    ↓ (HTTPS callout)
Backend Service (Python/Node.js)
    ↓ (authenticated API)
Compliant Repository
```

## WebViewer Integration

### Message Protocol

WebViewer and the LWC communicate via `postMessage`:

**LWC → WebViewer**:
```javascript
this.iframeWindow.postMessage({
    type: 'OPEN_DOCUMENT_BLOB',
    payload: { blob, filename, documentId }
}, '*');
```

**WebViewer → LWC**:
```javascript
window.parent.postMessage({
    type: 'SAVE_DOCUMENT',
    payload: { base64Data, filename, contentDocumentId }
}, '*');
```

### Custom Message Types

Add new message types for connector operations:

```javascript
case 'REQUEST_SAVE_TO_CONNECTOR':
    // Export document and send back
    const doc = this.wvInstance.Core.documentViewer.getDocument();
    const xfdf = await this.wvInstance.Core.annotationManager.exportAnnotations();
    const data = await doc.getFileData({ xfdfString: xfdf });
    
    window.parent.postMessage({
        type: 'SAVE_TO_CONNECTOR_RESPONSE',
        payload: { data, filename: this.currentFilename }
    }, '*');
    break;
```

## Configuration Management

### Option 1: Hardcoded (Development Only)

```javascript
class DriveConnector extends BaseConnector {
    constructor() {
        super();
        this.clientId = 'YOUR_CLIENT_ID';
        this.apiKey = 'YOUR_API_KEY';
    }
}
```

### Option 2: Custom Metadata (Recommended)

Create Custom Metadata Type:
```
Object: Connector_Config__mdt
Fields:
  - ConnectorId__c (Text)
  - Client_Id__c (Text)
  - Api_Key__c (Text, Encrypted)
  - Backend_Url__c (URL)
```

Apex controller:
```apex
@AuraEnabled(cacheable=true)
public static Map<String, String> getConnectorConfig(String connectorId) {
    List<Connector_Config__mdt> configs = [
        SELECT Client_Id__c, Api_Key__c, Backend_Url__c
        FROM Connector_Config__mdt
        WHERE ConnectorId__c = :connectorId
        LIMIT 1
    ];
    
    if (configs.isEmpty()) return null;
    
    return new Map<String, String>{
        'clientId' => configs[0].Client_Id__c,
        'apiKey' => configs[0].Api_Key__c,
        'backendUrl' => configs[0].Backend_Url__c
    };
}
```

LWC usage:
```javascript
import getConnectorConfig from '@salesforce/apex/ConnectorConfigController.getConnectorConfig';

async ensureConfigLoaded() {
    if (this.configLoaded) return;
    
    const config = await getConnectorConfig({ connectorId: 'gdrive' });
    this.clientId = config.clientId;
    this.apiKey = config.apiKey;
    this.configLoaded = true;
}
```

### Option 3: Named Credentials (Enterprise)

For server-side API callouts:
```apex
HttpRequest req = new HttpRequest();
req.setEndpoint('callout:Google_Drive_API/files');
req.setMethod('GET');

Http http = new Http();
HttpResponse res = http.send(req);
```

## Security Best Practices

### Client-Side Considerations

**Current Implementation** (POC):
- ✅ OAuth tokens in memory only (not persisted)
- ✅ HTTPS-only communication
- ⚠️ API credentials in source code
- ⚠️ Direct browser-to-API communication

**Production Requirements**:
- ❌ Never commit credentials to source control
- ✅ Use Custom Metadata or Named Credentials
- ✅ Encrypt sensitive configuration
- ✅ Implement token refresh logic
- ✅ Add error handling for auth failures

### Backend Service Architecture

For production, implement a backend service:

```
┌─────────────────┐
│  Salesforce LWC │
└────────┬────────┘
         │ HTTPS (Named Credential)
         ↓
┌─────────────────┐
│ Backend Service │
│  (Python/Node)  │
└────────┬────────┘
         │ Service Account / OAuth
         ↓
┌─────────────────┐
│  Google Drive   │
└─────────────────┘
```

**Benefits**:
- Credentials never exposed to client
- Service account for consistent access
- Rate limiting and quota management
- Audit logging
- Additional security layers

### CSP (Content Security Policy)

Salesforce enforces CSP. For Google APIs, you may need to:

1. Load scripts from trusted domains
2. Use `loadScript()` from `lightning/platformResourceLoader`
3. Or upload Google API library as static resource

**Whitelist Domains** (if needed):
- `https://apis.google.com`
- `https://www.googleapis.com`

## Testing

### Unit Testing Connectors

```javascript
// Example Jest test
import { registerConnector, getConnector } from 'c/connectorRegistry';
import DriveConnector from 'c/connectorDrive';

describe('DriveConnector', () => {
    it('should register successfully', () => {
        const connector = getConnector('gdrive');
        expect(connector).toBeInstanceOf(DriveConnector);
    });
    
    it('should handle pickFile', async () => {
        const connector = getConnector('gdrive');
        // Mock Google Picker
        global.google = { picker: { /* mocks */ } };
        
        const descriptor = await connector.pickFile({});
        expect(descriptor).toHaveProperty('fileId');
    });
});
```

### Integration Testing

1. Deploy to Salesforce org
2. Add component to Lightning page
3. Test each connector:
   - File selection
   - File opening
   - Annotation/editing
   - Save back to source
4. Verify error handling
5. Test switching between connectors

### Manual Testing Checklist

- [ ] Salesforce connector opens files from ContentVersion
- [ ] Google Drive connector authenticates successfully
- [ ] Google Picker shows user's files
- [ ] Selected file opens in WebViewer
- [ ] Annotations can be added
- [ ] Edited document saves back to source
- [ ] Error messages are user-friendly
- [ ] Switching connectors works without errors
- [ ] Component works on mobile (if required)

## Performance Considerations

### Lazy Loading

Load connector scripts only when needed:

```javascript
async loadConnector(connectorId) {
    if (connectorId === 'gdrive') {
        await import('c/connectorDrive');
    } else if (connectorId === 'salesforce') {
        await import('c/connectorSalesforce');
    }
}
```

### Caching

Cache authentication tokens:
```javascript
this.authToken = null;
this.tokenExpiry = null;

async getToken() {
    if (this.authToken && Date.now() < this.tokenExpiry) {
        return this.authToken;
    }
    
    // Refresh token
    await this.ensureAuthorized();
    return this.authToken;
}
```

### File Size Limits

Be aware of limits:
- Salesforce: Max 2GB for ContentVersion
- Google Drive: Max 5TB per file
- Browser memory: Depends on device
- WebViewer: Handles large files efficiently

## Troubleshooting

### Common Issues

**1. "Connector not registered"**
- Ensure connector is imported in pdftronWvInstance
- Check for import errors in console
- Verify connector calls `registerConnector()`

**2. "Google APIs not loading"**
- Check CSP settings
- Verify internet connectivity
- Try loading from static resource instead

**3. "OAuth authentication fails"**
- Verify OAuth origins match your Salesforce domain
- Check API key restrictions
- Ensure APIs are enabled in Google Cloud

**4. "File won't open in WebViewer"**
- Verify arrayBuffer is valid
- Check mimeType is supported
- Review browser console for errors

**5. "Save operation fails"**
- Check network tab for API errors
- Verify authentication token is valid
- Ensure proper permissions on target folder

## Future Enhancements

### Planned Features

1. **Multi-connector UI**: Dropdown to switch connectors in real-time
2. **Connector configuration UI**: Admin page to manage connectors
3. **Backend service**: Microservice for secure API operations
4. **Additional connectors**: Box, Dropbox, OneDrive, SharePoint
5. **Audit logging**: Track all file operations
6. **Advanced permissions**: Folder-level access control
7. **Offline support**: Cache files for offline viewing
8. **Collaboration**: Real-time co-editing annotations

### Extension Points

- Add custom file validators
- Implement custom picker UIs
- Add file transformation pipeline
- Support for custom metadata
- Webhook notifications on save

## Appendix

### API Reference Links

- [Apryse WebViewer API](https://apryse.com/documentation/web/guides/basics/open/)
- [Google Drive API v3](https://developers.google.com/drive/api/v3/reference)
- [Google Picker API](https://developers.google.com/picker/docs)
- [Salesforce LWC Dev Guide](https://developer.salesforce.com/docs/component-library/documentation/en/lwc)
- [Salesforce ContentVersion Object](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_contentversion.htm)

### Related Documentation

- `agents.md` - Complete implementation specification
- `README.md` - Setup and usage guide
- `webviewer-salesforce/README.md` - Original Apryse sample documentation
