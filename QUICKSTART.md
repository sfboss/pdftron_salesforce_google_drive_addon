# Quick Start Guide

This guide will help you get the PDFTron WebViewer with Connector Architecture up and running quickly.

## Prerequisites

- Salesforce Developer Edition org or Sandbox
- Salesforce CLI (sf CLI) installed
- Node.js and npm installed
- Google Cloud account (for Google Drive integration)

## 5-Minute Quick Start (Salesforce Connector Only)

If you just want to test the base functionality without Google Drive:

### 1. Clone and Deploy

```bash
# Clone the repository
git clone https://github.com/sfboss/pdftron_salesforce_google_drive_addon.git
cd pdftron_salesforce_google_drive_addon/webviewer-salesforce

# Authenticate to Salesforce
sf org login web --alias PdftronDev

# Deploy to Salesforce
sf project deploy start --target-org PdftronDev
```

### 2. Add to Lightning Page

1. Open your Salesforce org
2. Go to Setup → Lightning App Builder
3. Create a new Lightning page or edit existing
4. Add the `pdftronWvInstance` component
5. Save and activate

### 3. Test

Open the Lightning page and verify the WebViewer loads with the default PDF.

---

## Full Setup with Google Drive (30 minutes)

### Part 1: Google Cloud Setup (15 minutes)

#### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Name: `pdftron-drive-integration`
4. Click **Create**

#### Step 2: Enable APIs

1. In the left menu, go to **APIs & Services** → **Library**
2. Search for and enable:
   - **Google Drive API**
   - **Google Picker API**

#### Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. If prompted, configure OAuth consent screen:
   - User Type: **External** (or Internal if Google Workspace)
   - App name: `PDFTron WebViewer`
   - User support email: Your email
   - Developer contact: Your email
   - Add scopes: `../auth/drive.readonly` and `../auth/drive.file`
   - Add test users (your email)
   - Save and continue

4. Back to Credentials, create OAuth client ID:
   - Application type: **Web application**
   - Name: `PDFTron Salesforce Integration`
   
5. **Authorized JavaScript origins**:
   ```
   https://yourinstance.lightning.force.com
   https://yourdomain.my.salesforce.com
   https://yourdomain--c.visualforce.com
   ```
   
   Replace `yourinstance` and `yourdomain` with your actual Salesforce domain.
   
   To find your domain:
   - Go to Salesforce Setup
   - Search for "My Domain"
   - Copy the domain URL (e.g., `https://mycompany-dev-ed.lightning.force.com`)

6. Click **Create**
7. **Copy the Client ID** - you'll need this shortly

#### Step 4: Create API Key

1. Go to **Credentials** → **Create Credentials** → **API Key**
2. **Copy the API Key**
3. Click **Restrict Key** (recommended):
   - Application restrictions: **HTTP referrers**
   - Add your Salesforce domains (same as above)
   - API restrictions: Select **Restrict key**
   - Select: **Google Drive API** and **Google Picker API**
4. Click **Save**

#### Step 5: Get App ID

Your Google Cloud Project Number is your App ID:
1. Go to **IAM & Admin** → **Settings**
2. Copy the **Project number** (e.g., `123456789012`)

### Part 2: Configure the Connector (5 minutes)

#### Update connectorDrive.js

1. Navigate to the file:
   ```
   webviewer-salesforce/force-app/main/default/lwc/connectorDrive/connectorDrive.js
   ```

2. Update lines 10-12 with your credentials:
   ```javascript
   this.clientId = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
   this.apiKey   = 'YOUR_API_KEY';
   this.appId    = 'YOUR_PROJECT_NUMBER';
   ```

   Example:
   ```javascript
   this.clientId = '123456789-abc123def456.apps.googleusercontent.com';
   this.apiKey   = 'AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
   this.appId    = '123456789012';
   ```

#### Set Default Connector (Optional)

To make Google Drive the default instead of Salesforce:

1. Edit `webviewer-salesforce/force-app/main/default/lwc/connectorRegistry/connectorRegistry.js`
2. Change line 42:
   ```javascript
   export const DEFAULT_CONNECTOR_ID = 'gdrive';  // Changed from 'salesforce'
   ```

Or edit `pdftronWvInstance.js` line 41:
```javascript
@track activeConnectorId = 'gdrive';  // Changed from DEFAULT_CONNECTOR_ID
```

### Part 3: Deploy to Salesforce (10 minutes)

#### Deploy the LWC Components

```bash
cd webviewer-salesforce

# Deploy just the connector components
sf project deploy start -d force-app/main/default/lwc/connectorRegistry -u PdftronDev
sf project deploy start -d force-app/main/default/lwc/connectorDrive -u PdftronDev
sf project deploy start -d force-app/main/default/lwc/connectorSalesforce -u PdftronDev
sf project deploy start -d force-app/main/default/lwc/pdftronWvInstance -u PdftronDev

# Or deploy everything at once
sf project deploy start -d force-app/main/default -u PdftronDev
```

#### Add Component to Page

1. In Salesforce, go to Setup → Lightning App Builder
2. Create new page or edit existing
3. Drag `pdftronWvInstance` component onto page
4. Save and activate

---

## Testing Your Setup

### Test Salesforce Connector

1. Open the Lightning page with the WebViewer
2. The default PDF should load automatically
3. Use existing file browser to select Salesforce files
4. Verify files open correctly

### Test Google Drive Connector

1. Open browser Developer Tools (F12)
2. In Console, set the connector:
   ```javascript
   // If not already using Drive as default
   // You may need to modify the component first
   ```

3. The first time you open a Drive file:
   - Google sign-in popup will appear
   - Approve the requested permissions
   - Google Picker will open

4. Select a file from your Drive
5. File should load in WebViewer
6. Make annotations
7. Save - file should update in Drive

### Troubleshooting

**"OAuth error" or "403 Forbidden"**
- Verify your Salesforce domain is in Authorized JavaScript origins
- Check that APIs are enabled
- Ensure OAuth consent screen is configured

**"Connector not found"**
- Verify imports in `pdftronWvInstance.js`
- Check browser console for registration errors
- Ensure components are deployed

**"Cannot load Google APIs"**
- Check CSP settings in Salesforce
- Verify internet connectivity
- Check browser console for specific errors

**WebViewer doesn't load**
- Verify static resources are deployed
- Check that `lib` and `myfiles` resources exist
- Review browser console for errors

---

## Next Steps

### 1. Customize Configuration

For production, move credentials to Custom Metadata:
- See `README.md` section "Custom Metadata (Recommended for Production)"
- Create `Connector_Config__mdt` custom metadata type
- Store credentials securely

### 2. Add UI Controls

Enhance the WebViewer with connector buttons:
- Edit `webviewer-salesforce/force-app/main/default/staticresources/myfiles/config_apex.js`
- Add custom buttons to WebViewer toolbar
- Wire up to `handleOpenFromConnector()` and `handleSaveToConnector()`

### 3. Test Different File Types

- PDFs (native support)
- Office documents (DOCX, XLSX, PPTX)
- Images (JPG, PNG)
- Verify all work with both connectors

### 4. Add More Connectors

Follow the pattern in `connectorCompliantRepo.js` to add:
- Box
- Dropbox
- OneDrive
- SharePoint
- Custom repositories

---

## Support Resources

- **Main README**: Comprehensive documentation
- **IMPLEMENTATION.md**: Technical deep-dive
- **agents.md**: Original architecture specification
- [Apryse Documentation](https://apryse.com/documentation/web/)
- [Salesforce LWC Guide](https://developer.salesforce.com/docs/component-library/documentation/en/lwc)
- [Google Drive API](https://developers.google.com/drive/api/guides/about-sdk)

---

## Production Checklist

Before going live:

- [ ] Move credentials from code to Custom Metadata
- [ ] Set up Named Credentials for API callouts
- [ ] Configure proper OAuth consent screen (verified status)
- [ ] Add error handling and user notifications
- [ ] Implement proper token refresh logic
- [ ] Add audit logging
- [ ] Test with different user profiles and permissions
- [ ] Configure CSP (Content Security Policy) properly
- [ ] Set up monitoring and alerts
- [ ] Create user documentation
- [ ] Train users on connector selection
- [ ] Plan for WebViewer license key

---

## Getting Help

If you encounter issues:

1. Check the **Troubleshooting** section above
2. Review browser console for errors
3. Check Salesforce debug logs
4. Verify all configuration steps
5. Open an issue on GitHub with:
   - Error message
   - Browser console logs
   - Steps to reproduce
   - Your environment details

## Development Tips

- Use Chrome DevTools for debugging
- Enable debug mode in Salesforce
- Test in a sandbox first
- Keep backups before major changes
- Use version control (git) for tracking changes
- Document any customizations you make

---

**Ready to Deploy?** Follow the steps above and you'll have a working connector-based WebViewer integration in under an hour!
