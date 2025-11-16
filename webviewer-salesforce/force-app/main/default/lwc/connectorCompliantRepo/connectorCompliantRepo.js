import { BaseConnector, registerConnector } from 'c/connectorRegistry';

/**
 * Skeleton connector for future "Compliant Repo" integration
 * This demonstrates how to add new connectors without modifying existing code
 */
class CompliantRepoConnector extends BaseConnector {
    constructor() {
        super();
        // TODO: Add configuration for compliant repo backend
        this.backendUrl = 'YOUR_COMPLIANT_REPO_BACKEND_URL';
    }

    async listFiles(context) {
        // TODO: Call backend/search repo for available files
        throw new Error('CompliantRepoConnector.listFiles not yet implemented');
    }

    async pickFile(context) {
        // TODO: Implement file picker UI or API call to compliant repo
        throw new Error('CompliantRepoConnector.pickFile not yet implemented');
    }

    async openFile(fileDescriptor, context) {
        // TODO: Return { url, headers } or { arrayBuffer, filename }
        // from the compliant repository
        throw new Error('CompliantRepoConnector.openFile not yet implemented');
    }

    async saveFile(savePayload, context) {
        // TODO: Handle secure upload to compliant repository
        throw new Error('CompliantRepoConnector.saveFile not yet implemented');
    }
}

// Uncomment to register when ready to use
// registerConnector('compliantRepo', new CompliantRepoConnector());

export default CompliantRepoConnector;
