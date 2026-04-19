import {
  OPCUAClient,
  OPCUAClientOptions,
  ClientSession,
  MessageSecurityMode,
  SecurityPolicy,
} from 'node-opcua';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

class OpcuaClientService {
  private client: OPCUAClient | null = null;
  private session: ClientSession | null = null;
  private status: ConnectionStatus = 'disconnected';
  private currentUrl: string = '';

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getCurrentUrl(): string {
    return this.currentUrl;
  }

  isConnected(): boolean {
    return this.status === 'connected' && this.session !== null;
  }

  getSession(): ClientSession {
    if (!this.session) throw new Error('Not connected to OPC UA server');
    return this.session;
  }

  async connect(endpointUrl: string): Promise<void> {
    if (this.status === 'connected') {
      await this.disconnect();
    }

    this.status = 'connecting';
    this.currentUrl = endpointUrl;

    const options: OPCUAClientOptions = {
      applicationName: 'OPCUASimulator',
      connectionStrategy: {
        initialDelay: 1000,
        maxRetry: 3,
        maxDelay: 10000,
      },
      securityMode: MessageSecurityMode.None,
      securityPolicy: SecurityPolicy.None,
      endpointMustExist: false,
    };

    try {
      this.client = OPCUAClient.create(options);
      await this.client.connect(endpointUrl);
      this.session = await this.client.createSession();
      this.status = 'connected';
    } catch (err) {
      this.status = 'error';
      this.client = null;
      this.session = null;
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.session) {
        await this.session.close();
        this.session = null;
      }
      if (this.client) {
        await this.client.disconnect();
        this.client = null;
      }
    } finally {
      this.status = 'disconnected';
      this.currentUrl = '';
    }
  }
}

export const opcuaClient = new OpcuaClientService();
