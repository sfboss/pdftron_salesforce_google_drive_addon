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

    // Optional: "Pick file using native picker" (Drive Picker, etc)
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
