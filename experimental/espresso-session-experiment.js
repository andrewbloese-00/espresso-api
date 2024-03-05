import {
  Espresso,
  EspressoError,
  HTTP_STATUS_CODES,
  EspressoRoute as Route,
  EspressoRouter as Router,
  EspressoSessions,
  getSessionProtect,
} from "../src/Espresso.js";
import { randomBytes } from "crypto";

const UsersDB = [];
const sessions = {}; //optionally have initial state for the session store...
const store = EspressoSessions(sessions);

//implement a user store. "implements" IUserStore
const User = {
  getUser: async (id) => {
    const user = await UsersDB.find((u) => u.uid == id);
    return user || null;
  },
  createUser(user) {
    if (!user.username || !user.email || !user.password) return null;
    const uid = randomBytes(24).toString("hex");
    UsersDB.push({ uid, ...user });
    return uid;
  },
};

//create session middleware, providing the applications session and user store
const ProtectSession = getSessionProtect(store, User);

//define basic auth routes
const signin = new Route("post", "/auth/signin", {}, async (ctx) => {
  const { email, password } = ctx.body;
  if (!email || !password)
    return EspressoError(
      "You must provide an email and password to sign in",
      HTTP_STATUS_CODES.BAD_REQUEST,
    );

  const user = UsersDB.find((u) => u.email === email);
  if (!user || user.password !== password)
    return EspressoError("Invalid Credentials", HTTP_STATUS_CODES.FORBIDDEN);
  else {
    const sessionId = EspressoSessions.createSession(user);
    ctx.setCookies({ sessionId });
  }
  return {
    ok: 201,
    payload: { message: "Signed in Successfully!" },
  };
});
const signup = new Route("post", "/auth/signup", {}, async (ctx) => {
  const { email, password, username } = ctx.body;
  if (!email || !password)
    return EspressoError(
      "You must provide an email,username and password to sign up",
      HTTP_STATUS_CODES.BAD_REQUEST,
    );

  //'generate user id'
  const reply = User.createUser({ username, email, password });
  if (!reply) return;

  const user = await User.getUser(reply);

  const sessionId = EspressoSessions.createSession(user);
  if (!sessionId)
    return EspressoError(
      "Could not create session!",
      HTTP_STATUS_CODES.INTERNAL,
    );

  ctx.setCookies({ sessionId });
  return {
    ok: 201,
    payload: { message: "Signed Up Successfully!" },
  };
});
//route with session middleware
const account = new Route("get", "/auth/account", {}, ProtectSession, (ctx) => {
  return {
    ok: 200,
    payload: { user: ctx.data.user },
  };
});

const app = new Router(signin, signup, account);

Espresso(app, 5432);
