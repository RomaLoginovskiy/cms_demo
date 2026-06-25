import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { Shape, UserIdentity } from '../types/models';
import {
  applyLagDelay,
  getActiveLagSimConfig,
  shouldDelayHubOutbound
} from '../../observability/canvasLagSim';
import {
  emitMeetJoined,
  emitWsClosed,
  emitWsOpened,
  emitWsReconnected
} from '../../observability/rumJourney/journeyEvents';
import { isScenarioActiveFlag } from '../../observability/rumScenarios/scenarioFlags';
import { measurementService } from '../../services/measurements';
import { getHubUrl } from '../api/apiBase';

export interface BoardHubHandlers {
  onShapeCreated: (shape: Shape) => void;
  onShapeUpdated: (shape: Shape) => void;
  onShapeDeleted: (shapeId: string) => void;
  onCursorMoved: (userId: string, x: number, y: number) => void;
  onSelectionChanged: (userId: string, shapeIds: string[]) => void;
  onPresenceSnapshot: (users: UserIdentity[]) => void;
  onPresenceJoined: (user: UserIdentity) => void;
  onPresenceLeft: (userId: string) => void;
  onStatusChanged: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
}

const HUB_URL = getHubUrl();

export class BoardHubClient {
  private connection: HubConnection;
  private boardId: string | null = null;
  private identity: UserIdentity | null = null;
  private wsChurnTimer: number | null = null;

  constructor(private readonly handlers: BoardHubHandlers) {
    this.connection = new HubConnectionBuilder()
      .withUrl(HUB_URL)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    this.connection.on('ShapeCreated', handlers.onShapeCreated);
    this.connection.on('ShapeUpdated', handlers.onShapeUpdated);
    this.connection.on('ShapeDeleted', handlers.onShapeDeleted);
    this.connection.on('CursorMoved', handlers.onCursorMoved);
    this.connection.on('SelectionChanged', handlers.onSelectionChanged);
    this.connection.on('PresenceSnapshot', handlers.onPresenceSnapshot);
    this.connection.on('PresenceJoined', handlers.onPresenceJoined);
    this.connection.on('PresenceLeft', handlers.onPresenceLeft);
    this.connection.onreconnecting(() => {
      emitWsClosed(false, 1006);
      measurementService.sendCustomMeasurement('whiteboard_hub_reconnecting', 1, { status: 'connecting' });
      handlers.onStatusChanged('connecting');
    });
    this.connection.onreconnected(() => {
      emitWsReconnected();
      measurementService.sendCustomMeasurement('whiteboard_hub_reconnected', 1, { status: 'connected' });
      handlers.onStatusChanged('connected');
      void this.rejoin();
    });
    this.connection.onclose(() => {
      emitWsClosed(false, 1006);
      measurementService.sendCustomMeasurement('whiteboard_hub_disconnected', 1, { status: 'disconnected' });
      handlers.onStatusChanged('disconnected');
    });
  }

  async connect(boardId: string, identity: UserIdentity): Promise<void> {
    const startTime = performance.now();
    this.boardId = boardId;
    this.identity = identity;
    this.handlers.onStatusChanged('connecting');

    if (this.connection.state === HubConnectionState.Disconnected) {
      await this.connection.start();
      emitWsOpened(HUB_URL);
    }

    await this.rejoin();
    this.handlers.onStatusChanged('connected');
    measurementService.sendCustomMeasurement('whiteboard_hub_connect_ms', performance.now() - startTime, { status: 'connected' });
    this.startWsChurnIfActive();
  }

  async disconnect(): Promise<void> {
    this.stopWsChurn();
    if (this.boardId && this.connection.state === HubConnectionState.Connected) {
      await this.connection.invoke('LeaveBoard', this.boardId);
    }

    if (this.connection.state !== HubConnectionState.Disconnected) {
      await this.connection.stop();
    }
  }

  async createShape(shape: Shape): Promise<void> {
    await this.invoke('CreateShape', shape.boardId, shape);
  }

  async updateShape(shape: Shape): Promise<void> {
    await this.invoke('UpdateShape', shape.boardId, shape);
  }

  async deleteShape(boardId: string, shapeId: string): Promise<void> {
    await this.invoke('DeleteShape', boardId, shapeId);
  }

  async moveCursor(boardId: string, x: number, y: number): Promise<void> {
    await this.invoke('MoveCursor', boardId, x, y);
  }

  async setSelection(boardId: string, shapeIds: string[]): Promise<void> {
    await this.invoke('SetSelection', boardId, shapeIds);
  }

  private async rejoin(): Promise<void> {
    if (!this.boardId || !this.identity) {
      return;
    }

    await this.connection.invoke('JoinBoard', this.boardId, this.identity.userId, this.identity.displayName, this.identity.color);
    emitMeetJoined(this.boardId);
    measurementService.sendCustomMeasurement('whiteboard_hub_joined', 1, { operation: 'join_board' });
  }

  private async invoke(method: string, ...args: unknown[]): Promise<void> {
    const lagConfig = getActiveLagSimConfig();
    const lagMode = lagConfig?.mode ?? 'off';
    const labels = { hub_method: method, lag_sim_mode: lagMode };

    measurementService.startTimeMeasurement('whiteboard_hub_invoke', labels);
    const started = performance.now();

    try {
      if (lagConfig && shouldDelayHubOutbound(lagConfig)) {
        await applyLagDelay(lagConfig.delayMs, lagConfig.jitterMs);
      }

      await this.connection.invoke(method, ...args);
      this.trackHubInvoke(method, args);
      measurementService.sendCustomMeasurement('whiteboard_hub_invoke_ms', performance.now() - started, labels);
    } catch (error) {
      measurementService.sendCustomMeasurement('whiteboard_hub_error', 1, { hub_method: method });
      this.handlers.onStatusChanged('error');
      throw error;
    } finally {
      measurementService.endTimeMeasurement('whiteboard_hub_invoke');
    }
  }

  private trackHubInvoke(method: string, args: unknown[]): void {
    if (method === 'MoveCursor') {
      return;
    }

    const shape = args.find(isShape);
    measurementService.sendCustomMeasurement('whiteboard_hub_invocation', 1, {
      hub_method: method,
      ...(shape ? { shape_type: shape.type } : {})
    });
  }

  private startWsChurnIfActive(): void {
    if (!isScenarioActiveFlag('s13_ws_churn') || this.wsChurnTimer !== null) {
      return;
    }

    this.wsChurnTimer = window.setInterval(() => {
      void this.forceReconnectCycle();
    }, 8000);
  }

  private stopWsChurn(): void {
    if (this.wsChurnTimer !== null) {
      window.clearInterval(this.wsChurnTimer);
      this.wsChurnTimer = null;
    }
  }

  private async forceReconnectCycle(): Promise<void> {
    if (this.connection.state === HubConnectionState.Disconnected) {
      return;
    }
    try {
      emitWsClosed(false, 1006);
      await this.connection.stop();
      await this.connection.start();
      emitWsOpened(HUB_URL);
      emitWsReconnected();
      await this.rejoin();
    } catch {
      this.handlers.onStatusChanged('error');
    }
  }
}

function isShape(value: unknown): value is Shape {
  return typeof value === 'object' && value !== null && 'type' in value;
}

export function throttle<T extends (...args: never[]) => void>(fn: T, waitMs: number): T {
  let last = 0;
  let timeout: number | undefined;

  return ((...args: Parameters<T>) => {
    const now = window.performance.now();
    const remaining = waitMs - (now - last);

    window.clearTimeout(timeout);
    if (remaining <= 0) {
      last = now;
      fn(...args);
      return;
    }

    timeout = window.setTimeout(() => {
      last = window.performance.now();
      fn(...args);
    }, remaining);
  }) as T;
}
