import { BaseConnector, registerConnector } from 'c/connectorRegistry';
import getBase64FromCv from '@salesforce/apex/PDFTron_ContentVersionController.getBase64FromCv';

class SalesforceConnector extends BaseConnector {
    async listFiles(context) {
        // Optional: implement using Apex to list ContentDocuments by RecordId
        return [];
    }

    async openFile(fileDescriptor, context) {
        // fileDescriptor: { contentVersionId, fileName }
        const { contentVersionId, fileName } = fileDescriptor;

        try {
            // Call Apex method that returns ContentVersionWrapper with base64 content
            const cvWrapper = await getBase64FromCv({ recordId: contentVersionId });
            
            if (!cvWrapper || !cvWrapper.body) {
                throw new Error('Failed to retrieve file content');
            }

            // Convert base64 to ArrayBuffer for WebViewer
            const base64Data = cvWrapper.body;
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);

            return {
                arrayBuffer: byteArray.buffer,
                filename: fileName || cvWrapper.cv.Title,
                contentVersionId: contentVersionId
            };
        } catch (error) {
            console.error('Error in SalesforceConnector.openFile:', error);
            throw error;
        }
    }

    async saveFile(savePayload, context) {
        // savePayload: { arrayBuffer, filename, recordId?, contentVersionId? }
        // This will be called via the existing message handler pattern
        // The actual save is handled by PDFTron_ContentVersionController.saveDocument
        // which is called from the main LWC via postMessage
        return savePayload;
    }

    async pickFile(context) {
        // For Salesforce, file picking is handled by the existing file browser component
        // This could be enhanced to show a modal or use the existing pdftronWvFileBrowserComponent
        throw new Error('Salesforce file picking uses the existing file browser component');
    }
}

// Auto-register the Salesforce connector when this module is imported
registerConnector('salesforce', new SalesforceConnector());
