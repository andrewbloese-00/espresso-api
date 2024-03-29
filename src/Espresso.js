import http from "http";
import { EspressoSessionStore } from "./EspressoSessionStore.js";

//START TYPEDEFS
/**
 * @typedef {{error?:EspressoErr, ok?:number}} EspressoHandlerResponse
 * @typedef {{message: string, code: number}} EspressoErr
 * @typedef {"json"|"urlencoded"|'urlencoded-extended'} BodyParserName
 * @typedef {((req:http.IncomingMessage)=>Promise<[null,any]|[unknown,null]>)} BodyParser
 * @typedef {{uid: string, [key:string]:any}} Session
 * @typedef {{
 * sync:boolean,
 * createSession: ((uid:string)=>string|(uid:string)=>Promise<string>),
 * getSession: (((sessionId:string)=>Session|null)|(sessionId:string)=>Promise<Session|null>)
 * updateSession: ((sessionId:string,updates:any)=>boolean|(sessionId:string,updates:any)=>Promise<boolean>)
 * endSession: ((sessionId:string)=>boolean|(sessionId:string)=>Promise<boolean>)
 * }} SessionStore
 * @typedef {{getUser: ((id:string)=>Promise<any|null>),  createUser:(value:any) => Promise<string|null>}} IUserStore
 */

//END TYPEDEFS

const PARAM_REGEX_STR = "([^/]+)";
/**
 * @type {{[name:string]:BodyParser}}
 */
const BodyParsers = {
  json: (req) =>
    new Promise((resolve) => {
      let chunks = [];
      req.on("data", (chunk) => {
        chunks.push(chunk);
      });
      req.on("end", () => {
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
          resolve([null, payload]);
        } catch (error) {
          resolve([error, null]);
        }
      });
    }),
  urlencoded: (req) => {},
  "urlencoded-extended": (req) => {},
};
export const HTTP_STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  BAD_REQUEST: 400,
  PAYMENT_REQD: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TIMEOUT: 408,
  INTERNAL: 500,
  NOT_IMPL: 501,
  BAD_GATEWAY: 502,
};

/**
 * @param {string} message the error message
 * @param {number} code an error status code
 */
export const EspressoError = (message, code) => ({ error: { message, code } });

/**
 * @description the hub for Espresso, uses regex based path matching
 */
export class EspressoRouter {
  /**
   * @param {...EspressoRoute} routes
   */
  constructor(...routes) {
    /**
     * @type {{[key:string]: {regex:RegExp,route:EspressoRoute}[]}}
     */
    this.routes = {
      get: [],
      post: [],
      put: [],
      delete: [],
    };

    this.registerMany(...routes);
  }
  /**
   * @param {EspressoRoute} espressoRoute
   * @param {}
   */
  register(espressoRoute) {
    const segments = espressoRoute.path.split("/").filter(Boolean);
    const re = [];
    const paramNames = [];
    for (let i = 0; i < segments.length; i++) {
      if (segments[i][0] === ":") {
        //pattern match for param
        paramNames.push([i, segments[i].slice(1)]);
        re.push(PARAM_REGEX_STR);
      } else {
        //exact match for non param segments
        re.push(segments[i]);
      }
    }

    const params = {};
    for (let [i, param] of paramNames) {
      espressoRoute.paramSchema[param].segmentNumber = i;
    }
    const regex = new RegExp(`^/${re.join("/")}(\\?.*)?$`);
    this.routes[espressoRoute.method].push({
      regex,
      params,
      route: espressoRoute,
    });
  }
  /**
   * @param {IncomingMessage} req
   */
  findRoute(req) {
    const path = req.url;
    const method = req.method.toLowerCase();
    const matchFound = this.routes[method].findIndex(({ regex }) =>
      regex.test(path),
    );
    if (matchFound >= 0) return this.routes[method][matchFound].route;

    return null;
  }

  registerMany(...routes) {
    for (let route of routes) {
      this.register(route);
    }
  }
}

/**
 * @description an API Route for Espresso, currently supports get, post, put, and delete requests.
 */
export class EspressoRoute {
  /**
   * @param {"get"|"post"|"put"|"delete"} method
   * @param {string} path
   * @param {...(ctx:EspressoContext)=>Promise<EspressoHandlerResponse>} handlers
   * @param {{paramSchema: {}, querySchema: {}}} config
   */
  constructor(method, path, config, ...handlers) {
    this.method = method;
    this.path = path;
    this.handlers = handlers;
    this.paramSchema = {};
    this.querySchema = {};
    for (let param in config.paramSchema ?? {}) {
      switch (config.paramSchema[param]) {
        case "string":
          this.paramSchema[param] = {
            format: (x) => String(x),
            segmentNumber: -1,
          };
          break;
        case "number":
          this.paramSchema[param] = {
            format: (x) => Number(x),
            segmentNumber: -1,
          };
          break;
        case "date":
          this.paramSchema[param] = {
            format: (x) => new Date(x),
            segmentNumber: -1,
          };
          break;
        default:
          this.paramSchema[param] = {
            format: (x) => JSON.parse(x),
            segmentNumber: -1,
          };
      }
    }
    for (let queryParam in config.querySchema ?? {}) {
      switch (config.querySchema[queryParam]) {
        case "string":
          this.querySchema[queryParam] = (x) => String(x);
        case "number":
          this.querySchema[queryParam] = (x) => Number(x);
        case "date":
          this.querySchema[queryParam] = (x) => new Date(x);
        default:
          this.querySchema[queryParam] = (x) => JSON.parse(x);
      }
    }
  }

  /**
   * @param {EspressoContext} ctx
   */
  async use(ctx) {
    let tmp = {};
    let status = 500;
    for (let i = 0; i < this.handlers.length; i++) {
      //handler
      if (ctx._res.closed) return;
      const reply = await this.handlers[i](ctx);
      if (reply?.error) return ctx.error(reply.error.message, reply.error.code);
      status = reply?.ok || HTTP_STATUS_CODES.OK;
      if (reply?.payload) tmp = reply.payload;
    }
    if (ctx._res.closed) return;
    //if not handled by the final handler, close the request
    if (!tmp) ctx._res.end();
    if (typeof tmp === "string") return ctx.text(tmp, status);
    return ctx.json(tmp, status);
  }
}

/**
 * @description a wrapper for the standard `http.IncomingRequest` and `http.ServerResponse` provides parsers for query parameters, url params, and json bodies. Helper functions for common response types like json, text, and errors.
 */
export class EspressoContext {
  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  constructor(req, res) {
    this.params = {};
    this.query = {};
    this.cookies = {};
    this.body = {};
    this.data = {};
    this._req = req;
    this._res = res;
  }

  //header helpers
  /**
   * @about checks the request headers for a Bearer <token> authorization header, and returns the <token> , or null if none found
   */
  bearer() {
    if (this._req.headers.authorization?.startsWith("Bearer")) {
      const token = this._req.headers.authorization.split(" ").pop();
      return token || null;
    }
    return null;
  }

  /**
   * @param {{[cookieName:string]:(string|number|boolean)}} cookiesObj
   */
  setCookies(cookiesObj) {
    //sets the response cookies based on input cookiesObject
    const cookieStr = Object.entries(cookiesObj)
      .map(([k, v]) => k + "=" + encodeURIComponent(v))
      .join("; ");

    if (cookieStr.length / 2 > 4096)
      console.error("Max cookies length exceeded, will not set cookies.");
    else this._res.setHeader("Set-Cookie", cookieStr);
  }

  //parsers
  /**
   * @description parses the context request body, storing parsed fields in `<EspressoContext>.body` returns false if parse fails, true otherwise
   */
  async parseBody() {
    //currently only supports json body
    switch (this._req.headers["content-type"]) {
      case "application/json": {
        const [error, payload] = await BodyParsers.json(this._req);
        if (error) {
          console.error("Failed to parse body 'json'", error);
          return false;
        }
        //attach the parsed json body to the context
        this.body = payload;
        return true;
      }
      case "application/x-www-form-urlencoded": {
        console.warn("Not Yet Supported");
        return false;
      }
      default:
        console.error(
          `Unsupported content-type: ${this._req.headers["content-type"]}`,
        );
        return false;
    }
  }
  /**
   * @param {EspressoRoute} route
   * @description parses the params defined on a route. attaches the to `< EspressoContext >.params` field as an object
   */
  async parseParams(route) {
    const segments = this._req.url.split("/").filter(Boolean);
    if (!route?.paramSchema) return;
    for (let param in route.paramSchema) {
      const { format, segmentNumber } = route.paramSchema[param];
      this.params[param] = format(segments[segmentNumber]);
    }
  }
  /**
   * @param {EspressoRoute} route required for query param checking
   * @description parses the 'query params' portion of the url and attaches as an object to the `< EspressoContext >.query` field.
   */
  parseQuery(route) {
    const query = this._req.url.split("?").pop();
    const recievedQueryParams = query.split("&");
    for (let keyValuePair of recievedQueryParams) {
      const [key, value] = keyValuePair.split("=");
      if (key in route.querySchema) {
        this.query[key] = route.querySchema[key](value);
      } else {
        this.query[key] = value;
      }
    }
  }

  parseCookies() {
    if (this._req.headers.cookie) {
      const rawCookies = this._req.headers.cookie.split(";");
      for (let i = 0; i < rawCookies.length; i++) {
        let [name, ...rest] = rawCookies[i].split("=");
        name = name?.trim();
        const value = rest.join("=".trim());
        if (!value) return;
        this.cookies[name] = decodeURIComponent(value);
      }
    }
    //Thanks to https://stackoverflow.com/questions/3393854/get-and-set-a-single-cookie-with-node-js-http-server
  }

  //response helpers
  /**
   * @param {number} code an http status code
   * @description responds using the context response object with an error message and code
   */
  error(message, code = 500) {
    this._res.statusCode = code;
    this._res.write(message);
    this._res.end();
  }

  /**
   * @param {string}  msg whatever text to be sent in the response
   * @param {number} code http status status code
   * @description responds using the context response object with success code and json payload
   */
  text(msg, code) {
    this._res.statusCode = code;
    this._res.write(msg, "utf8");
    this._res.end();
  }

  /**
   * @param {*} payload a JSON stringifyable object
   * @param {number} code the success status code
   * @description responses using the context response object with success code and json payload
   */
  json(payload, code = 200, pretty = false) {
    try {
      const payloadStr = payload
        ? JSON.stringify(payload, null, pretty ? 4 : 0)
        : "{}";
      this._res.statusCode = code;
      this._res.setHeader("Content-Type", "application/json");
      this._res.statusCode = code;
      this._res.write(payloadStr);
      this._res.end();
    } catch (err) {
      console.error(err);
      this._res.statusCode = 500;
      this._res.write(err);
      this._res.end();
    }
  }
}

/**
 * @param {EspressoRouter} router your espresso router with routes defined
 * @param {number} port the port to launch the espresso app on.
 * @description The 'driver' for espresso router
 */
export async function Espresso(router, port = 8080) {
  const server = http.createServer(async (req, res) => {
    const ctx = new EspressoContext(req, res);
    const route = router.findRoute(req);
    if (!route) {
      //Not Found
      return ctx.error(`No Route For: ${req.url}`, HTTP_STATUS_CODES.NOT_FOUND);
    }
    if (!route["paramSchema"]) route["paramSchema"] = {};
    let canUse = true;
    console.time("parse request");
    if (Object.keys(route.paramSchema).length > 0) {
      await ctx.parseParams(route);
    }
    //only attempt to parse cookies when present
    if (req.headers.cookie) ctx.parseCookies();

    ctx.parseQuery(route);
    if (req.method.toLowerCase() !== "get") canUse = await ctx.parseBody();
    console.timeEnd("parse request");
    if (!canUse)
      return ctx.error("Error In Parsing", HTTP_STATUS_CODES.BAD_REQUEST);

    console.time(`[${route.method} ${route.path}]handlers`);
    await route.use(ctx);
    console.timeEnd(`[${route.method} ${route.path}]handlers`);
  });

  server.listen(port, () => {
    console.log(`☕️ Espresso Listening via HTTP on : ${port}`);
  });
  return server;
}

//middleware helpers
/**
 * @param {IUserStore} userStore
 * @param {(token:string)=>string} decodeToIdFn a function that returns the id of the user the token belongs to
 */
export function getBearerProtect(userStore, decodeToIdFn) {
  /**
   * @param {EspressoContext} ctx
   */
  return async (ctx) => {
    const ERR = EspressoError("No Token!", HTTP_STATUS_CODES.FORBIDDEN);
    const token = ctx.bearer();
    if (!token) return ERR;
    const id = decodeToIdFn(token);
    const user = await userStore.getUser(id);
    if (user) {
      const { password, ...safeUser } = user;
      ctx.data["user"] = safeUser;
    } else return ERR;
  };
}

/**
 * @param {EspressoSessionStore|SessionStore} sessionStore
 * @param {IUserStore} userStore
 */
export function getSessionProtect(sessionStore, userStore) {
  /**
   * @param {EspressoContext} ctx
   */
  return async (ctx) => {
    const FORBIDDEN_ERR = EspressoError(
      "Invalid Session",
      HTTP_STATUS_CODES.FORBIDDEN,
    );
    if (ctx.cookies.sessionId) {
      const sesh = sessionStore.sync
        ? sessionStore.getSession(ctx.cookies.sessionId)
        : await sessionStore.getSession(ctx.cookies.sessionId); //only await for async sessionStore

      if (!sesh) return FORBIDDEN_ERR;

      const user = await userStore.getUser(sesh.uid);
      if (!user) return FORBIDDEN_ERR;
      const { password, ...safeUser } = user;
      ctx.data["user"] = safeUser;
    } else {
      return FORBIDDEN_ERR;
    }
  };
}
