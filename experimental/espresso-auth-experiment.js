//example using bearer <token> method with headers
import {
  Espresso,
  EspressoError,
  HTTP_STATUS_CODES,
  EspressoRoute as Route,
  EspressoRouter as Router,
  getBearerProtect, //protect middleware using "Bearer <token>" autho
} from "../src/Espresso.js";

import { randomBytes } from "crypto";

//"db"
const UsersDB = [];

//implement a user store
const User = {
  getUser: async (id) => {
    const user = await user.find((u) => u.id == id);
    return user || null;
  },
  createUser(user) {
    if (!user.username || !user.email || !user.password) return null;
    const id = randomBytes(24).toString("hex");
    UsersDB.push({ id, ...user });
    return id;
  },
};

//middleware
const BearerProtect = getBearerProtect(User);

//routes
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

  return {
    ok: 201,
    payload: { token: user.id },
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
  //'sign' a token

  const token = `${Date.now()}.${id}`;
  return {
    ok: 201,
    payload: { token },
  };
});
//route with middleware
const account = new Route("get", "/auth/account", {}, BearerProtect, (ctx) => {
  return {
    ok: 200,
    payload: { user: ctx.data.user },
  };
});

const app = new Router(signin, signup, account);

Espresso(app, 5432);
