import { EventEmitter } from 'events'

export const arenaEvents = new EventEmitter()
arenaEvents.setMaxListeners(100)
