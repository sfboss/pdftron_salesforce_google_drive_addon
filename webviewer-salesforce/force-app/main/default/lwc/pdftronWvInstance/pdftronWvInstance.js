import getUser from '@salesforce/apex/PDFTron_ContentVersionController.getUser';
import saveDocument from '@salesforce/apex/PDFTron_ContentVersionController.saveDocument';
import libUrl from '@salesforce/resourceUrl/lib';
import myfilesUrl from '@salesforce/resourceUrl/myfiles';
import { fireEvent, registerListener, unregisterAllListeners } from 'c/pubsub';
import { CurrentPageReference } from 'lightning/navigation';
import { loadScript } from 'lightning/platformResourceLoader';
import { api, LightningElement, track, wire } from 'lwc';
import mimeTypes from './mimeTypes';
import { getConnector, DEFAULT_CONNECTOR_ID } from 'c/connectorRegistry';
import 'c/connectorSalesforce';
import 'c/connectorDrive';

function _base64ToArrayBuffer(base64) {
  var binary_string =  window.atob(base64);
  var len = binary_string.length;
  var bytes = new Uint8Array( len );
  for (var i = 0; i < len; i++)        {
      bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

export default class PdftronWvInstance extends LightningElement {
  //initialization options
  fullAPI = true;
  enableRedaction = true;
  enableFilePicker = true;

  uiInitialized = false;

  source = 'My file';
  @api recordId;

  @wire(CurrentPageReference)
  pageRef;

  username;
  
  // Connector-related properties
  @track activeConnectorId = DEFAULT_CONNECTOR_ID;
  currentFileDescriptor = null;
  wvInstance = null;

  get activeConnector() {
    return getConnector(this.activeConnectorId);
  }

  connectedCallback() {
    registerListener('blobSelected', this.handleBlobSelected, this);
    registerListener('closeDocument', this.closeDocument, this);
    registerListener('downloadDocument', this.downloadDocument, this);
    registerListener('fileSelected', this.handleFileSelected, this);
    window.addEventListener('message', this.handleReceiveMessage.bind(this), false);
  }

  disconnectedCallback() {
    unregisterAllListeners(this);
    window.removeEventListener('message', this.handleReceiveMessage);
  }

  handleBlobSelected(record) {
    const blobby = new Blob([_base64ToArrayBuffer(record.body)], {
      type: mimeTypes[record.FileExtension]
    });


    const payload = {
      blob: blobby,
      extension: record.cv.FileExtension,
      filename: record.cv.Title + "." + record.cv.FileExtension,
      documentId: record.cv.Id
    };

    this.iframeWindow.postMessage({ type: 'OPEN_DOCUMENT_BLOB', payload }, '*');
  }

  renderedCallback() {
    var self = this;

    if (this.uiInitialized) { 
        return;
    }

    Promise.all([
        loadScript(self, libUrl + '/webviewer.min.js')
    ])
    .then(() => this.handleInitWithCurrentUser())
    .catch(console.error);
  }

  handleFileSelected(file) {
    this.iframeWindow.postMessage({type: 'OPEN_DOCUMENT', file: file}, '*')
  }

  handleInitWithCurrentUser() {
    getUser()
    .then((result) => {
        this.username = result;
        this.error = undefined;

        this.initUI();
    })
    .catch((error) => {
      console.error(error);
      this.showNotification('Error', error.body.message, 'error');
    });
  }

  initUI() {
    var myObj = {
      libUrl: libUrl,
      fullAPI: this.fullAPI || false,
      namespacePrefix: '',
      username: this.username,
    };
    var url = myfilesUrl + '/webviewer-demo-annotated.pdf';

    const viewerElement = this.template.querySelector('div')
    // eslint-disable-next-line no-unused-vars
    const viewer = new WebViewer.Iframe({
      path: libUrl, // path to the PDFTron 'lib' folder on your server
      custom: JSON.stringify(myObj),
      backendType: 'ems',
      config: myfilesUrl + '/config_apex.js',
      fullAPI: this.fullAPI,
      enableFilePicker: this.enableFilePicker,
      enableRedaction: this.enableRedaction,
      enableMeasurement: this.enableMeasurement,
      enableOptimizedWorkers: true,
      loadAsPDF: true,
      // l: 'YOUR_LICENSE_KEY_HERE',
    }, viewerElement);

    viewerElement.addEventListener('ready', () => {
      this.iframeWindow = viewerElement.querySelector('iframe').contentWindow;
    })

  }

  handleReceiveMessage(event) {
    const me = this;
    if (event.isTrusted && typeof event.data === 'object') {
      switch (event.data.type) {
        case 'SAVE_DOCUMENT':
          const cvId = event.data.payload.contentDocumentId;
          saveDocument({ json: JSON.stringify(event.data.payload), recordId: this.recordId ? this.recordId : '', cvId: cvId })
          .then((response) => {
            me.iframeWindow.postMessage({ type: 'DOCUMENT_SAVED', response }, '*')
            fireEvent(this.pageRef, 'refreshOnSave', response);
          })
          .catch(error => {
            me.iframeWindow.postMessage({ type: 'DOCUMENT_SAVED', error }, '*')
            fireEvent(this.pageRef, 'refreshOnSave', error);
            console.error(event.data.payload.contentDocumentId);
            console.error(JSON.stringify(error));
            this.showNotification('Error', error.body, 'error')
          });
          break;
        default:
          break;
      }
    }
  }

  downloadDocument() {
    this.iframeWindow.postMessage({type: 'DOWNLOAD_DOCUMENT' }, '*')
  }

  @api
  closeDocument() {
    this.iframeWindow.postMessage({type: 'CLOSE_DOCUMENT' }, '*')
  }

  // Connector-based methods
  async handleOpenFromConnector() {
    const connector = this.activeConnector;
    if (!connector) {
      console.error('No active connector available');
      return;
    }

    try {
      // Step 1: ask connector for a file
      const descriptor = await connector.pickFile({ recordId: this.recordId });
      if (!descriptor) return; // User cancelled

      // Step 2: open the file using the connector
      const filePayload = await connector.openFile(descriptor, { recordId: this.recordId });

      // filePayload can be { url, headers } or { arrayBuffer, filename }
      if (!this.iframeWindow) {
        console.error('WebViewer iframe not ready');
        return;
      }

      // Load document based on payload type
      if (filePayload.arrayBuffer) {
        // Convert ArrayBuffer to Blob for WebViewer
        const blob = new Blob([filePayload.arrayBuffer], {
          type: 'application/pdf'
        });
        
        const payload = {
          blob: blob,
          filename: filePayload.filename,
          documentId: filePayload.contentVersionId || filePayload.fileId
        };

        this.iframeWindow.postMessage({ type: 'OPEN_DOCUMENT_BLOB', payload }, '*');
      } else if (filePayload.url) {
        // For URL-based loading (future enhancement)
        this.iframeWindow.postMessage({ 
          type: 'OPEN_DOCUMENT_URL', 
          url: filePayload.url,
          filename: filePayload.filename,
          headers: filePayload.headers
        }, '*');
      }

      // Store descriptor for saves (Drive fileId, etc)
      this.currentFileDescriptor = descriptor;
    } catch (error) {
      console.error('Error opening file from connector:', error);
      this.showNotification('Error', error.message || 'Failed to open file', 'error');
    }
  }

  async handleSaveToConnector() {
    const connector = this.activeConnector;
    if (!connector || !this.iframeWindow) {
      console.error('Connector or WebViewer not available');
      return;
    }

    try {
      // Request the document data from WebViewer
      // This will trigger a message back with the document data
      this.iframeWindow.postMessage({ type: 'REQUEST_SAVE_TO_CONNECTOR' }, '*');
    } catch (error) {
      console.error('Error saving to connector:', error);
      this.showNotification('Error', error.message || 'Failed to save file', 'error');
    }
  }

  showNotification(title, message, variant) {
    // Show a toast notification (if available)
    // This is a placeholder - implement based on your notification system
    console.log(`${variant.toUpperCase()}: ${title} - ${message}`);
  }
}