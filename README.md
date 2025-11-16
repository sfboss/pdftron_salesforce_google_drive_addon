# PDFTron WebViewer with Connector Architecture

This is a forked and enhanced version of the [Apryse/PDFTron webviewer-salesforce](https://github.com/ApryseSDK/webviewer-salesforce) sample that adds a connector abstraction layer for flexible file source integration.

## Architecture Overview

The project implements a **connector pattern** that abstracts file I/O operations (open, save, list) from the WebViewer component. This allows seamless integration with multiple file sources:

- **Salesforce Files** (default) - Native Salesforce file storage
- **Google Drive** - Cloud file storage with Google Picker integration
- **Compliant Repo** (skeleton) - Future integration for compliance-focused repositories

## Project Structure

```
pdftron_salesforce_google_drive_addon/
├── agents.md                    # Detailed implementation requirements
├── PROJECT_LOG.md              # Project creation log
└── webviewer-salesforce/       # Salesforce DX project (forked from Apryse)
    └── force-app/main/default/
        ├── lwc/
        │   ├── pdftronWvInstance/          # Main WebViewer component (enhanced)
        │   ├── connectorRegistry/          # Connector registry & base interface
        │   ├── connectorSalesforce/        # Salesforce Files connector
        │   ├── connectorDrive/             # Google Drive connector
        │   └── connectorCompliantRepo/     # Skeleton for future connector
        ├── classes/
        │   └── PDFTron_ContentVersionController.cls  # Apex controller
        └── staticresources/
            └── (WebViewer static resources)
```

## Features

### Connector Architecture

Each connector implements a standard interface:
- `listFiles(context)` - List available files
- `pickFile(context)` - Open file picker UI
- `openFile(fileDescriptor, context)` - Load file into WebViewer
- `saveFile(savePayload, context)` - Save edited document back to source

### Google Drive Integration

- Uses **Google Picker** for file selection
- Uses **Google Drive API** for file download/upload
- Supports OAuth 2.0 authentication
- Direct browser-to-Drive communication (can be enhanced with backend for security)

### Extensibility

The architecture is designed to easily add new connectors:
1. Create a new connector class extending `BaseConnector`
2. Implement the required methods
3. Register the connector with `registerConnector()`
4. Use it by setting `activeConnectorId`

## Setup Instructions

### 1. Salesforce Setup

#### Prerequisites
- Salesforce Developer Edition org or Sandbox
- Salesforce CLI (sf CLI)
- Node.js and npm

#### Clone and Authenticate

```bash
# Clone the repository
git clone https://github.com/sfboss/pdftron_salesforce_google_drive_addon.git
cd pdftron_salesforce_google_drive_addon/webviewer-salesforce

# Authenticate to your Salesforce org
sf org login web --alias PdftronDev
```

#### Setup WebViewer Static Resources

1. Download the WebViewer SDK from [Apryse](https://apryse.com/)
2. Extract and run the optimization script:

```bash
npm install
npm run optimize
```

3. This creates optimized static resources for Salesforce
4. Copy the generated `.zip` files to `force-app/main/default/staticresources/`

#### Deploy to Salesforce

```bash
# Deploy the entire project
sf project deploy start --target-org PdftronDev

# Or deploy specific components
sf project deploy start -d force-app/main/default/lwc -u PdftronDev
sf project deploy start -d force-app/main/default/classes -u PdftronDev
```

#### Add to Lightning Page

1. In Salesforce Setup, go to Lightning App Builder
2. Create a new Lightning page or edit an existing one
3. Add the `pdftronWvInstance` component to the page
4. Save and activate the page

### 2. Google Drive Setup

#### Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (e.g., `pdftron-drive-integration`)
3. Enable the following APIs:
   - Google Drive API
   - Google Picker API

#### Configure OAuth 2.0

1. Go to **APIs & Services** > **Credentials**
2. Create **OAuth 2.0 Client ID**:
   - Application type: **Web application**
   - Name: `PDFTron Salesforce Integration`
   - Authorized JavaScript origins:
     - `https://yourinstance.lightning.force.com`
     - `https://yourdomain.my.salesforce.com`
     - `https://yourdomain.my.salesforce-sites.com` (if using Sites)
   - Authorized redirect URIs:
     - `https://yourinstance.lightning.force.com/apex/callback` (if needed)

3. Create an **API Key**:
   - Go to **Credentials** > **Create Credentials** > **API Key**
   - Restrict the key to Google Drive API and Picker API
   - Copy the API key

#### Update Connector Configuration

Edit `force-app/main/default/lwc/connectorDrive/connectorDrive.js`:

```javascript
this.clientId = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
this.apiKey   = 'YOUR_API_KEY';
this.appId    = 'YOUR_APP_ID'; // Your Google Cloud Project number
```

**For Production**: Store these credentials in Salesforce Custom Metadata or Named Credentials instead of hardcoding.

#### Deploy Updated Connector

```bash
sf project deploy start -d force-app/main/default/lwc/connectorDrive -u PdftronDev
```

### 3. Usage

#### Switch Between Connectors

In `pdftronWvInstance.js`, set the default connector:

```javascript
@track activeConnectorId = 'salesforce';  // or 'gdrive'
```

Or import from `connectorRegistry.js`:

```javascript
export const DEFAULT_CONNECTOR_ID = 'gdrive';  // Change here
```

#### Using Google Drive Connector

1. Set `activeConnectorId` to `'gdrive'`
2. The component will automatically:
   - Load Google APIs
   - Prompt for OAuth authentication
   - Open Google Picker when opening files
   - Save back to Drive when saving

#### Using Salesforce Connector

1. Set `activeConnectorId` to `'salesforce'`
2. The component uses the existing Salesforce file browser
3. Files are loaded from and saved to Salesforce ContentVersion

## Configuration Options

### Custom Metadata (Recommended for Production)

Create a Custom Metadata Type `Connector_Config__mdt`:

Fields:
- `ConnectorId__c` (Text) - e.g., "gdrive"
- `Client_Id__c` (Text)
- `Api_Key__c` (Text, Encrypted)
- `Org_Default_Connector__c` (Text) - Default connector for the org

Then create an Apex controller to retrieve configuration:

```apex
@AuraEnabled(cacheable=true)
public static Map<String, String> getConnectorConfig(String connectorId) {
    Connector_Config__mdt config = [
        SELECT Client_Id__c, Api_Key__c 
        FROM Connector_Config__mdt 
        WHERE ConnectorId__c = :connectorId 
        LIMIT 1
    ];
    return new Map<String, String>{
        'clientId' => config.Client_Id__c,
        'apiKey' => config.Api_Key__c
    };
}
```

## Adding New Connectors

To add a new file source connector:

1. **Create the Connector LWC**:
   ```bash
   mkdir force-app/main/default/lwc/connectorMySource
   ```

2. **Implement the Interface**:
   ```javascript
   import { BaseConnector, registerConnector } from 'c/connectorRegistry';
   
   class MySourceConnector extends BaseConnector {
       async pickFile(context) { /* ... */ }
       async openFile(fileDescriptor, context) { /* ... */ }
       async saveFile(savePayload, context) { /* ... */ }
   }
   
   registerConnector('mySource', new MySourceConnector());
   ```

3. **Import in pdftronWvInstance**:
   ```javascript
   import 'c/connectorMySource';
   ```

4. **Use the Connector**:
   ```javascript
   this.activeConnectorId = 'mySource';
   ```

## Security Considerations

### Current Implementation (POC)

- Google API credentials are in client-side code
- OAuth tokens are handled in the browser
- Direct Drive API calls from Salesforce

### Production Recommendations

1. **Backend Service**: Create a microservice to handle Drive API calls
   - Store credentials server-side
   - Use service accounts for Drive access
   - Return signed URLs or tokens to Salesforce

2. **Named Credentials**: Use Salesforce Named Credentials for API callouts
   - Store OAuth credentials securely
   - Handle token refresh automatically

3. **Custom Metadata**: Store configuration in encrypted Custom Metadata Types
   - Never hardcode credentials
   - Use Platform Encryption for sensitive fields

## Troubleshooting

### Google Drive Authentication Issues

1. Verify OAuth origins include your Salesforce domain
2. Check browser console for CORS errors
3. Ensure Google Drive and Picker APIs are enabled
4. Verify API key restrictions allow your domain

### WebViewer Not Loading

1. Confirm static resources are deployed
2. Check browser console for loading errors
3. Verify `lib` and `myfiles` static resources exist
4. Review CSP (Content Security Policy) settings in Salesforce

### Connector Errors

1. Check browser console for registration errors
2. Verify connector imports in `pdftronWvInstance.js`
3. Ensure `activeConnectorId` matches a registered connector
4. Validate connector implementation of required methods

## Development

### Testing Locally

The WebViewer component runs in Salesforce, but you can test connectors:

```bash
# Install dependencies
npm install

# Run linting
npm run lint

# Run tests (if available)
npm test
```

### Debugging

1. Enable debug mode in Salesforce
2. Open browser developer tools
3. Check console for connector messages
4. Monitor network tab for API calls

## References

- [Apryse WebViewer Documentation](https://apryse.com/documentation/web/)
- [Salesforce LWC Guide](https://developer.salesforce.com/docs/component-library/documentation/en/lwc)
- [Google Drive API](https://developers.google.com/drive/api/guides/about-sdk)
- [Google Picker API](https://developers.google.com/picker)

## License

Based on the original Apryse/PDFTron webviewer-salesforce sample.
Enhanced connector architecture by sfboss.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your connector or enhancement
4. Test thoroughly
5. Submit a pull request

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review `agents.md` for detailed architecture
3. Open an issue on GitHub
4. Contact the maintainer
