<h1 style="font-size: 5rem"> DO NOT USE - NOT MAINTAINED OR REALLY EVEN COMPLETED </h1>



# Espresso

An in progress REST API Framework for javascript. Built on top of nodejs http module for a minimal approach. Currently in very rough stages so can not suggest usage in a production environment.

## Examples

There will be examples of basic usage included in the `experimental` folder.

## Quick Start

```javascript
//import espresso components
import {
  Espresso,
  EspressoRouter as Router,
  EspressoRoute as Route,
  EspressoError,
  HTTP_STATUS_CODES
} from "path/to/Espresso.js";

//create a router
const app = new Router(
  new Route(
    "get", //method
    "/", //path (use :paramName for dynamic routes)
    {}, //optional query / param schemas
    (ctx)=>{ //handler
      ctx.text("Hello World!", HTTP_STATUS_CODES.OK);
    }
  ),
  new Route(
    "get",
    "/posts/:postId",
    {
      paramSchema: {postId: "string"}
    },
    //validate middleware
    (ctx)=>{
      if(!ctx.params.postId) return EspressoError(
        "Must provide a 'postId'",
        HTTP_STATUS_CODES.BAD_REQUEST
      );
    },
    //route handler - will not run if validate middleware fails (returns error)
    async (ctx)=>{
      const payload = await doSomething(ctx.params.postId);
      return {ok: 200,payload};
    }

  )
)
//register route(s) after initialization
app.register(new Route(...));
app.registerMany(new Route(...), new Route(...));


//start the espresso server on a given port
const port = process.env.PORT || 8080;
Espresso(app,port);

```

## Middleware

All middleware in Espresso accept in an `EspressoContext` and if it returns an `EspressoError` it will stop evaluating the handlers of the current route and respond with an appropriate error response. the context object can be mutated using the `espressoContextInstance.set(key,value)`

## Usage

RTFS
