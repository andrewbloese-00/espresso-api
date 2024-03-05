import {
  Espresso,
  EspressoError,
  HTTP_STATUS_CODES,
  EspressoRoute as Route,
  EspressoRouter as Router,
  EspressoBearerProtect, //protect middleware using "Bearer <token>" autho
} from "../src/Espresso.js";

//"db"
const Users = [];

//middleware

//routes
const signin = new Route("post", "/auth/signin", {}, async (ctx) => {
  const { email, password } = ctx.body;
  if (!email || !password)
    return EspressoError(
      "You must provide an email and password to sign in",
      HTTP_STATUS_CODES.BAD_REQUEST,
    );

  const user = Users.find((u) => u.email === email);
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
  const id = Math.floor(Math.random() * Date.now() + Date.now());
  Users.push({ id, email, password, username });
  //'sign' a token
  const token = `${Date.now()}.${id}`;
  return {
    ok: 201,
    payload: { token },
  };
});
//route with middleware
const account = new Route(
  "get",
  "/auth/account",
  {},
  EspressoBearerProtect,
  (ctx) => {
    if (!ctx.data.user)
      return {
        error: EspressoError("Must be signed in!", HTTP_STATUS_CODES.FORBIDDEN),
      };

    const { password, ...safeUser } = ctx.data.user;

    return {
      ok: 200,
      payload: { user: safeUser },
    };
  },
);

const app = new Router(signin, signup, account);

Espresso(app, 5432);
