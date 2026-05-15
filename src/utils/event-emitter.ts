// src/utils/event-emitter.ts
type Listener = (...args: any[]) => void | Promise<any>

export class EventEmitter<Events extends { [K in keyof Events]: Listener }> {
  private _listeners = new Map<keyof Events, Set<Listener>>()

  on<K extends keyof Events>(event: K, listener: Events[K]): void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set())
    }
    this._listeners.get(event)!.add(listener)
  }

  off<K extends keyof Events>(event: K, listener: Events[K]): void {
    this._listeners.get(event)?.delete(listener)
  }

  async emit<K extends keyof Events>(
    event: K,
    ...args: Parameters<Events[K]>
  ): Promise<void> {
    const listeners = this._listeners.get(event)
    if (!listeners) return
    for (const listener of listeners) {
      await listener(...args)
    }
  }
}

