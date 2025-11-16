# Configuration Template

This file provides templates for configuring the connector architecture.

## Google Drive Configuration

### Option 1: Hardcoded (Development Only)

Edit `webviewer-salesforce/force-app/main/default/lwc/connectorDrive/connectorDrive.js`:

```javascript
constructor() {
    super();
    // Replace these with your actual Google Cloud credentials
    this.clientId = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
    this.apiKey   = 'YOUR_API_KEY';
    this.appId    = 'YOUR_PROJECT_NUMBER';
    this.scope    = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';
}
```

### Option 2: Custom Metadata (Production Recommended)

#### Step 1: Create Custom Metadata Type

In Salesforce Setup → Custom Metadata Types → New:

```
Label: Connector Config
Plural Label: Connector Configs
Object Name: Connector_Config
```

**Fields:**

1. `ConnectorId`
   - Data Type: Text
   - Length: 50
   - Field Name: ConnectorId__c

2. `Client_Id`
   - Data Type: Text
   - Length: 255
   - Field Name: Client_Id__c

3. `Api_Key`
   - Data Type: Text (Encrypted)
   - Length: 255
   - Field Name: Api_Key__c

4. `App_Id`
   - Data Type: Text
   - Length: 100
   - Field Name: App_Id__c

5. `Backend_Url`
   - Data Type: URL
   - Field Name: Backend_Url__c

6. `Is_Active`
   - Data Type: Checkbox
   - Field Name: Is_Active__c
   - Default: Checked

#### Step 2: Create Custom Metadata Records

**For Google Drive:**
```
Label: Google Drive Config
Connector Config Name: Google_Drive
ConnectorId: gdrive
Client_Id: YOUR_CLIENT_ID.apps.googleusercontent.com
Api_Key: YOUR_API_KEY
App_Id: YOUR_PROJECT_NUMBER
Is_Active: true
```

**For Salesforce:**
```
Label: Salesforce Files Config
Connector Config Name: Salesforce_Files
ConnectorId: salesforce
Is_Active: true
```

#### Step 3: Create Apex Controller

Create `ConnectorConfigController.cls`:

```apex
public with sharing class ConnectorConfigController {
    
    @AuraEnabled(cacheable=true)
    public static Map<String, String> getConnectorConfig(String connectorId) {
        try {
            List<Connector_Config__mdt> configs = [
                SELECT Client_Id__c, Api_Key__c, App_Id__c, Backend_Url__c
                FROM Connector_Config__mdt
                WHERE ConnectorId__c = :connectorId
                AND Is_Active__c = true
                LIMIT 1
            ];
            
            if (configs.isEmpty()) {
                return null;
            }
            
            Connector_Config__mdt config = configs[0];
            
            return new Map<String, String>{
                'clientId' => config.Client_Id__c,
                'apiKey' => config.Api_Key__c,
                'appId' => config.App_Id__c,
                'backendUrl' => config.Backend_Url__c
            };
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving connector config: ' + e.getMessage());
        }
    }
    
    @AuraEnabled(cacheable=true)
    public static String getDefaultConnector() {
        try {
            List<Connector_Config__mdt> configs = [
                SELECT ConnectorId__c
                FROM Connector_Config__mdt
                WHERE Is_Active__c = true
                ORDER BY CreatedDate ASC
                LIMIT 1
            ];
            
            return configs.isEmpty() ? 'salesforce' : configs[0].ConnectorId__c;
        } catch (Exception e) {
            return 'salesforce';
        }
    }
}
```

Create `ConnectorConfigController.cls-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>57.0</apiVersion>
    <status>Active</status>
</ApexClass>
```

#### Step 4: Update Connector to Use Config

Edit `connectorDrive.js`:

```javascript
import { BaseConnector, registerConnector } from 'c/connectorRegistry';
import getConnectorConfig from '@salesforce/apex/ConnectorConfigController.getConnectorConfig';

class DriveConnector extends BaseConnector {
    constructor() {
        super();
        this.clientId = null;
        this.apiKey = null;
        this.appId = null;
        this.scope = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';
        
        this.gapiLoaded = false;
        this.pickerLoaded = false;
        this.authToken = null;
        this.configLoaded = false;
    }

    async ensureConfigLoaded() {
        if (this.configLoaded) return;
        
        try {
            const config = await getConnectorConfig({ connectorId: 'gdrive' });
            if (config) {
                this.clientId = config.clientId;
                this.apiKey = config.apiKey;
                this.appId = config.appId;
                this.configLoaded = true;
            } else {
                throw new Error('Google Drive connector configuration not found');
            }
        } catch (error) {
            console.error('Error loading Drive config:', error);
            throw error;
        }
    }

    async ensureAuthorized() {
        await this.ensureConfigLoaded();
        await this.ensureGapiLoaded();
        
        // ... rest of authorization code
    }
    
    // ... rest of connector implementation
}

registerConnector('gdrive', new DriveConnector());
```

#### Step 5: Update pdftronWvInstance

Edit `pdftronWvInstance.js` to use default connector from config:

```javascript
import getDefaultConnector from '@salesforce/apex/ConnectorConfigController.getDefaultConnector';

export default class PdftronWvInstance extends LightningElement {
    @track activeConnectorId = null;
    
    async connectedCallback() {
        // Get default connector from configuration
        try {
            this.activeConnectorId = await getDefaultConnector();
        } catch (error) {
            console.error('Error getting default connector:', error);
            this.activeConnectorId = 'salesforce';
        }
        
        // ... rest of connectedCallback
    }
    
    // ... rest of component
}
```

### Option 3: Named Credentials (Enterprise)

For server-side OAuth and API callouts:

#### Step 1: Create Named Credential

Setup → Named Credentials → New Named Credential:

```
Label: Google Drive API
Name: Google_Drive_API
URL: https://www.googleapis.com/drive/v3
Identity Type: Named Principal
Authentication Protocol: OAuth 2.0
Authentication Provider: [Create Auth Provider first]
Scope: https://www.googleapis.com/auth/drive.file
```

#### Step 2: Create Auth Provider

Setup → Auth. Providers → New:

```
Provider Type: Google
Name: Google_Drive
Consumer Key: YOUR_CLIENT_ID
Consumer Secret: YOUR_CLIENT_SECRET
Authorize Endpoint URL: https://accounts.google.com/o/oauth2/v2/auth
Token Endpoint URL: https://oauth2.googleapis.com/token
Default Scopes: https://www.googleapis.com/auth/drive.file
```

#### Step 3: Create Apex Callout

```apex
public class GoogleDriveService {
    
    @AuraEnabled
    public static String downloadFile(String fileId) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:Google_Drive_API/files/' + fileId + '?alt=media');
        req.setMethod('GET');
        
        Http http = new Http();
        HttpResponse res = http.send(req);
        
        if (res.getStatusCode() == 200) {
            return EncodingUtil.base64Encode(res.getBodyAsBlob());
        } else {
            throw new AuraHandledException('Error downloading file: ' + res.getStatus());
        }
    }
    
    @AuraEnabled
    public static String uploadFile(String fileId, String filename, String base64Data) {
        String boundary = '----WebKitFormBoundary' + String.valueOf(Crypto.getRandomInteger());
        
        String metadataJson = JSON.serialize(new Map<String, String>{
            'name' => filename,
            'mimeType' => 'application/pdf'
        });
        
        String body = '--' + boundary + '\r\n';
        body += 'Content-Type: application/json; charset=UTF-8\r\n\r\n';
        body += metadataJson + '\r\n';
        body += '--' + boundary + '\r\n';
        body += 'Content-Type: application/pdf\r\n';
        body += 'Content-Transfer-Encoding: base64\r\n\r\n';
        body += base64Data + '\r\n';
        body += '--' + boundary + '--';
        
        HttpRequest req = new HttpRequest();
        String endpoint = fileId != null 
            ? 'callout:Google_Drive_API/files/' + fileId + '?uploadType=multipart'
            : 'callout:Google_Drive_API/files?uploadType=multipart';
        req.setEndpoint(endpoint);
        req.setMethod(fileId != null ? 'PATCH' : 'POST');
        req.setHeader('Content-Type', 'multipart/related; boundary=' + boundary);
        req.setBody(body);
        
        Http http = new Http();
        HttpResponse res = http.send(req);
        
        if (res.getStatusCode() >= 200 && res.getStatusCode() < 300) {
            return res.getBody();
        } else {
            throw new AuraHandledException('Error uploading file: ' + res.getStatus());
        }
    }
}
```

## Environment-Specific Configuration

### Development

```javascript
// connectorDrive.js
const ENV = 'development';

if (ENV === 'development') {
    this.clientId = 'DEV_CLIENT_ID';
    this.apiKey = 'DEV_API_KEY';
}
```

### Sandbox

Use Custom Metadata with sandbox-specific credentials.

### Production

- Use Named Credentials
- Enable Platform Encryption for sensitive fields
- Implement token refresh logic
- Add comprehensive error handling

## Configuration Validation

Add validation to connector:

```javascript
validateConfig() {
    const errors = [];
    
    if (!this.clientId || this.clientId === 'YOUR_CLIENT_ID.apps.googleusercontent.com') {
        errors.push('Client ID not configured');
    }
    
    if (!this.apiKey || this.apiKey === 'YOUR_API_KEY') {
        errors.push('API Key not configured');
    }
    
    if (!this.appId || this.appId === 'YOUR_PROJECT_NUMBER') {
        errors.push('App ID not configured');
    }
    
    if (errors.length > 0) {
        throw new Error('Configuration errors: ' + errors.join(', '));
    }
}
```

## Connector Selection Configuration

### UI Selector Component

Create `connectorSelector.html`:

```html
<template>
    <lightning-card title="Document Source">
        <lightning-combobox
            name="connector"
            label="Select Source"
            value={activeConnectorId}
            options={connectorOptions}
            onchange={handleConnectorChange}>
        </lightning-combobox>
    </lightning-card>
</template>
```

Create `connectorSelector.js`:

```javascript
import { LightningElement, track } from 'lwc';
import { fireEvent } from 'c/pubsub';

export default class ConnectorSelector extends LightningElement {
    @track activeConnectorId = 'salesforce';
    
    connectorOptions = [
        { label: 'Salesforce Files', value: 'salesforce' },
        { label: 'Google Drive', value: 'gdrive' },
        { label: 'Compliant Repository', value: 'compliantRepo' }
    ];
    
    handleConnectorChange(event) {
        this.activeConnectorId = event.detail.value;
        fireEvent(this.pageRef, 'connectorChanged', this.activeConnectorId);
    }
}
```

### Default Connector by Profile

Create Custom Metadata for profile-based defaults:

```apex
@AuraEnabled(cacheable=true)
public static String getDefaultConnectorForUser() {
    String profileName = [SELECT Profile.Name FROM User WHERE Id = :UserInfo.getUserId()].Profile.Name;
    
    List<Connector_Config__mdt> configs = [
        SELECT ConnectorId__c
        FROM Connector_Config__mdt
        WHERE Profile_Name__c = :profileName
        AND Is_Active__c = true
        LIMIT 1
    ];
    
    return configs.isEmpty() ? 'salesforce' : configs[0].ConnectorId__c;
}
```

## Security Configuration

### CSP Trusted Sites

Add to Salesforce Setup → CSP Trusted Sites:

```
Label: Google APIs
Trusted Site URL: https://apis.google.com
Active: true
Context: All
```

```
Label: Google Content
Trusted Site URL: https://www.googleapis.com
Active: true
Context: All
```

### CORS Configuration

For backend services, configure CORS:

```javascript
// Express.js example
app.use(cors({
    origin: [
        'https://yourinstance.lightning.force.com',
        'https://yourdomain.my.salesforce.com'
    ],
    credentials: true
}));
```

## Summary

Choose the configuration method that fits your needs:

- **Hardcoded**: Quick dev/testing only
- **Custom Metadata**: Best for most production scenarios
- **Named Credentials**: Best for server-side OAuth and callouts

Always use secure storage for credentials and never commit them to version control.
