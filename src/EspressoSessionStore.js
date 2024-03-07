import { randomBytes } from "crypto";
/**
 * @typedef {{uid:string,[key:string]:any}} EspressoSessionEntry
 * @typedef {{[sessionId:string]: EspressoSessionEntry}} EspressoSessions
 */
/*
The Basic Contract For A Session Store With Espresso if you want to implement your own session store for espresso:
  interface ISessionStore {
   createSession(uid:string):string
   getSession(sessionId:string):EspressoSessionEntry | false
   endSession(sessionId:string):boolean
   updateSession(sessionId:string,updates:any):boolean
  }
 */

const MS_15_MINUTES = 900000;

/**
 * @description a synchronous, in-memory session store. Utilizes cryto module for session id generation
 */
export class EspressoSessionStore {
  /**@type {EspressoSessions} */
  #sessions;
  constructor() {
    this.sync = true; //is synchronous
    this.#sessions = {};
  }
  createSession({ uid }, expireIn = MS_15_MINUTES) {
    if (!uid) return null;
    const sessionId = randomBytes(24).toString("hex");
    this.#sessions[sessionId] = { uid, expires: Date.now() + expireIn };
    return sessionId;
  }
  getSession(sessionId) {
    const sysTime = Date.now();
    if (!this.#sessions[sessionId]) return null;
    if (this.#sessions[sessionId].expires < sysTime) {
      delete this.#sessions[sessionId];
      return null;
    }
    return this.#sessions[sessionId];
  }
  endSession(sessionId) {
    if (!this.#sessions[sessionId]) return false;
    delete this.#sessions[sessionId];
    return true;
  }
  updateSession(sessionId, updates) {
    if (!this.#sessions[sessionId]) return false;
    for (const key in updates) {
      if (key !== "uid") {
        this.#sessions[sessionId][key] = updates[key];
      }
    }
    return true;
  }
}
