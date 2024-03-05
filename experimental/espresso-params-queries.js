import {
  Espresso,
  EspressoRouter,
  EspressoRoute as Route,
  EspressoError,
} from "../src/Espresso.js";

const subs = [];

const ping = new Route("get", "/ping", {}, (_) => {
  return { ok: 201, payload: { message: "Hello From Espresso ☕" } };
});

const subscribe = new Route("post", "/subscribe", {}, (ctx) => {
  if (!ctx.body.name)
    return EspressoError("Must provide a 'name' to subscribe", 400);

  subs.push(ctx.body.name.toLowerCase());
  return {
    ok: 201,
    payload: {
      message: `Successfully subscribed ${ctx.body.name}!`,
      id: subs.length - 1,
    },
  };
});

const subscribersNamed = new Route(
  "get",
  "/subscribers/:name",
  {
    paramSchema: { name: "string" },
  },
  async (ctx) => {
    const n = subs.filter(
      (subscriber) => subscriber === ctx.params.name.toLowerCase(),
    ).length;
    return {
      ok: 200,
      payload: { n },
    };
  },
);

const getSubscribersQuery = { limit: "number", order: "string" };
const getSubscribers = new Route(
  "get",
  "/subscribers-list",
  {
    querySchema: getSubscribersQuery,
  },
  (ctx) => {
    const sorted =
      ctx.query.order === "desc"
        ? subs.sort((a, b) => {
            if (a < b) return 1;
            else if (a > b) return -1;
            else return 0;
          })
        : subs.sort();

    return {
      ok: 200,
      payload: {
        subscribers: sorted.slice(0, ctx.query.limit),
      },
    };
  },
);

const router = new EspressoRouter(
  ping,
  subscribe,
  subscribersNamed,
  getSubscribers,
);

async function main() {
  //starts a new server listening on 5432
  const server = await Espresso(router, 5432);
}
main();
