# Meteor HTTP Factory

[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![Project Status: Active – The project has reached a stable, usable state and is being actively developed.](https://www.repostatus.org/badges/latest/active.svg)](https://www.repostatus.org/#active)
![GitHub file size in bytes](https://img.shields.io/github/size/leaonline/http-factory/http-factory.js)
![GitHub](https://img.shields.io/github/license/leaonline/http-factory)

Create Meteor `WebApp` (connect) HTTP middleware. Lightweight. Simple.

With this package you can define factory functions to create a variety of Meteor HTTP routes.
Decouples definition from instantiation (also for the schema) and allows different configurations for different
types of HTTP routes.

**Minified size < 2KB!**

## Why do I want this?

- Decouple definition from instantiation
- Easy management between own and externally defined middleware on a local or global level
- Validate http request arguments (query/body) the same way as you do with `mdg:validated-method`
- Just pass in the schema as plain object, instead of manually instantiating `SimpleSchema`
- Easy builtin reponse schema, allowing you to either return a value (to create 200 responses) or throw an Error 
(for 500 responses). You can still customize responses via `req`, `res` and `next`.
- Easy data access and update between handlers using `this.data()` 


## Installation

Simply add this package to your meteor packages

```bash
$ meteor add leaonline:http-factory
```

## Usage

Import the `createHTTPFactory` function and create the factory function from it. 
The factory function can obtain the following arguments (*=optional):

- `path: String*`
- `schema: Object*` - depends on, if `schemaFactory` is defined
- `method: String*` - if defined, one of `['get', 'head', 'post', 'put', 'delete', 'options', 'trace', 'patch']`
- `validate: Function*` - if defined, a validation function that should throw an Error if validation fails
- `run: Function` - always required, the middleware handler to run on the current request 

### Basic example

To make life easier for you, the requests' `query` or `body` data is wrapped before the `run` call into a universal 
object. No need to directly access `req.query` or `req.body` and check for properties.
You can instead use the `function` environment's `data` method:

```javascript
import { createHTTPFactory } from 'meteor/leaonline:http-factory'
const createHttpRoute = createHTTPFactory() // default, no params

createHttpRoute({
  path: '/greetings',
  run: function (/* req, res, next */) {
    const { name } = this.data() // use this to get the current query/body data
    return `Hello, ${name}`
  }
})
```

This code creates a http route, that is handled on any incoming HTTP request (`get`, `post` etc.) and assumes either in query
or on body (depending on request type) to find a parameter, named `name`. Try it via the following client code:

```javascript
import { HTTP } from 'meteor/http'

HTTP.get('/greetings', { params: { name: 'Ada' }}, (err, res) => {
  console.log(res.content) // 'Hello, Ada'
})
```

### Use `WebApp.rawConnectHandlers`

If you need to define handlers before any other handler, just pass in the `raw` option:

```javascript
import { createHTTPFactory } from 'meteor/leaonline:http-factory'
const createHttpRoute = createHTTPFactory() // default, no params

createHttpRoute({
  raw: true,
  path: '/greetings',
  run: function (/* req, res, next */) {
    const { name } = this.data()
    return `Hello, ${name}`
  }
})
``` 

### Create universal handlers

You can omit `path` on order to run the handler at the root level. This is often used for
middleware like `cors`. 

### Specify a method

If you specify a HTTP method (one of `['get', 'head', 'post', 'put', 'delete', 'options', 'trace', 'patch']`) your
request will only be handled with the correct request method:

```javascript
import { WebApp } from 'meteor/webapp'
import { createHTTPFactory } from 'meteor/leaonline:http-factory'
import bodyParser from 'body-parser'

WebApp.connectHandlers.urlEncoded(bodyParser /*, options */) // inject body parser

const createHttpRoute = createHTTPFactory() // default, no params
createHttpRoute({
  path: '/greetings',
  method: 'post',
  run: function (/* req, res, next */) {
    const { name } = this.data()
    return `Hello, ${name}`
  }
})
```

The `data` will now contain the `body` data. Note, that you may need to install npm `body-parser` to 
work with body content, that is not form data encoded.

### Passing data to the next handler

We also made updating data much easier for you. You can pass an `Object` to the `this.data()` method in order to
attach new properties to a request or update existsing ones:


```javascript
import { WebApp } from 'meteor/webapp'
import { createHTTPFactory } from 'meteor/leaonline:http-factory'

const createHttpRoute = createHTTPFactory() // default, no params
createHttpRoute({
  path: '/greetings',
  method: 'get',
  run: function (req, res, next ) {
    const { name } = this.data()
    const updateData = {}
    if (name === 'Ada') {
      updateData.title = 'Mrs.'
    }
    if (name === 'Bob') {
      updateData.title = 'Mr.'
    }
    this.data(updateData)
    next()
  }
})

createHttpRoute({
  path: '/greetings',
  method: 'get',
  run: function (/* req, res, next */) {
    const { name, title } = this.data()
    return `Hello, ${title} ${name}`
  }
})
```

If you call the route, it will contain now the updated data:

```javascript
import { HTTP } from 'meteor/http'

HTTP.get('/greetings', { params: { name: 'Ada' }}, (err, res) => {
  console.log(res.content) // 'Hello, Mrs. Ada'
})

HTTP.get('/greetings', { params: { name: 'Bob' }}, (err, res) => {
  console.log(res.content) // 'Hello, Mr. Ada'
})
```

## Responding with errors

If a requests is intended to return a fail / error response (400/500 types) you may use our simple solutions, that cover
most of the cases, while ensuring your `run` code contains **logic** and not response handling. 

### Throwing 500 errors

If your `run` method is throwing an Error, then it will be catched and transformed to a `500`response:

```javascript
import { createHTTPFactory } from 'meteor/leaonline:http-factory'
const createHttpRoute = createHTTPFactory() // default, no params

createHttpRoute({
  path: '/greetings',
  run: function (/* req, res, next */) {
    const { name } = this.data()
    if (!name) throw new Error('Expected name')
    return `Hello, ${name}`
  }
})
```

The `err` param in the callback will then not be `null` but contain the error response:

```javascript
import { HTTP } from 'meteor/http'

HTTP.get('/greetings', {}, (err, res) => {
  const error = err.response
  console.log(error.statusCode) // 500
  console.log(error.data.title) // 'Internal Server Error'
  console.log(error.data.description) // 'An unintended error occurred.'
  console.log(error.data.info) // Expected name
})
```

### Handle custom error responses

If you have a custom error response to return, you can use the builtin `this.handleError` method:

```javascript
import { createHTTPFactory } from 'meteor/leaonline:http-factory'
const createHttpRoute = createHTTPFactory() // default, no params

createHttpRoute({
  path: '/greetings',
  run: function (req, res, next) {
    const data = this.data()
    if (!data.name) {
      return this.error({ 
          code: 400,
          title: 'Bad Request',
          description: 'Malformed query or body.'
      })
    }
    return `Hello, ${data.name}`
  }
})
```

## With schema

In order to take the burden of input validation from you, we have added a nice `schema` validation mechanism.
It works similar to the way `mdg:validated-method`.

We support various ways to validate an input schema. To **decouple** schema definition from instantiation, we introduced a `shemaFactory`, which
is basically a function that creates your schema for this collection. This also ensures, that
different HTTP routes don't share the same schema instances.

#### Using SimpleSchema

```javascript
import { createHTTPFactory } from 'meteor/leaonline:http-factory'
import SimpleSchema from 'simpl-schema'

const schemaFactory = definitions => new SimpleSchema(definitions)
const createHttpRoute = createHTTPFactory({ schemaFactory })

createHttpRoute({
  path: '/greetings',
  schema: {
    name: String
  },
  run: function (req, res, next) {
    const { name } = this.data()
    return `Hello, ${name}`
  }
})
```

Call the method via

```javascript
HTTP.get('/greetings', { params: { name: 'Ada' }}, (err, res) => {
  console.log(res.content) // 'Hello, Ada'
})
```

provoke a fail via

```javascript
HTTP.get('/greetings', (err, res) => {
  const error = err.response
  console.log(error.statusCode) // 400
  console.log(error.data.title) // 'Bad request'
  console.log(error.data.description) // 'Malformed query or body.'
  console.log(error.data.info) // Name is required <-- SimpleSchema error message
})
```

#### Overriding `validate` when using schema

You can also override the internal `validate` when using `schema` by passing a `validate` function.
This, however, disables the schema validation and is then your responsibility:

```javascript
import { createHTTPFactory } from 'meteor/leaonline:http-factory'
import SimpleSchema from 'simpl-schema'

const schemaFactory = definitions => new SimpleSchema(definitions)
const createHttpRoute = createHTTPFactory({ schemaFactory })

createHttpRoute({
  path: '/greetings',
  schema: {
    name: String
  },
  validate: () => {},
  run: function (/* req, res, next */) {
    const { name } = this.data()
    return `Hello, ${name}`
  }
})
```

and then call via


```javascript
HTTP.get('/greetings', (err, res) => {
  console.log(res.content) // 'Hello, undefined'
})
```

If none of these cover your use case, you can still create your own validation middleware.

#### Using check

You can also use Meteor's builtin `check` and `Match` for schema validation:

```javascript
import { check } from 'meteor/check'
import { MyCollection } from '/path/to/MyCollection'
import { createHTTPFactory } from 'meteor/leaonline:http-factory'

const schemaFactory = schema => ({
  validate (args) {
    check(args, schema)
  }
})

const createHttpRoute = createHTTPFactory({ schemaFactory })
createHttpRoute({
  path: '/greetings',
  schema: {
    name: String
  },
  run: function (/* req, res, next */) {
    const { name } = this.data()
    return `Hello, ${name}`
  }
})
```

Note, that some definitions for `SimpleSchema` and `check`/`Match` may differ.

## Using middleware

Often you need to use third-party middle ware, such as `cors` or `jwt`. This package makes it
super easy to do so.

### Define global middleware

First, you can define global middleware that is not bound to the factory environment, 
which allows for highest compatibility.
Just define it with a property name, that is not one of `schemaFactory, raw`:


```javascript
import { Meteor } from 'meteor/meteor'
import { createHTTPFactory } from 'meteor/leaonline:http-factory'

// is is just some simple example validation
// of non-standard a-auth-token header
const isValidToken = req => req.headers['x-auth-token'] === Meteor.settings.xAuthToken
const simpleAuthExternal = function (req, res, next) {
  if (!isValidToken(req)) {
    // external middleware is neither bound to the environment
    // nor affected in any way, so it can 100% maintin it's logic
    // however, this.error is not available here
    const body = JSON.stringify({ title: 'Permission Denied' })
    res.writeHead(403, { 'Content-Type': 'application/json' })
    res.end(body)
  }
  next()
}

// pass in this middleware on the abstract factory level
// to make all routes of all methods to use this
// additionally, use raw: true in order to ensure this is 
// run at the very first, before any package-level handlers
const createHttpRoute = createHTTPFactory({
  simpleAuth: simpleAuthExternal,
  raw: true
})

createHttpRoute({
  path: '/greetings',
  method: 'get',
  run: function () {
    const { name } = this.data()
    return `Hello, ${name}`
  }
})
```

now your  requests will run through this middleware:

```javascript
HTTP.get('/greetings', (err, res) => {
  const error = err.response
  console.log(error.statusCode) // 403
  console.log(errpr.data.title) // 'Permission Denid'
})

const params = { name: 'Ada' }
const headers = { 'x-auth-token': Meteor.settings.xAuthToken } // warning: passing secrets to the client is unsafe
HTTP.get('/greetings', { params, headers }, (err, res) => {
  console.log(res.content) // Hello, Ada
})
```

### Define route-specific middleware

You can also define external middleware on a specific route without affecting other routes. 
Just define it with a property name, that is not one of `path, schema, method, run, validate`:

```javascript
import { Meteor } from 'meteor/meteor'
import { createHTTPFactory } from 'meteor/leaonline:http-factory'
import { simpleAuthExternal } from '/path/to/simpleAuthExternal'

const createHttpRoute = createHTTPFactory()

createHttpRoute({
  path: '/greetings',
  simpleAuth: simpleAuthExternal,
  method: 'get',
  run: function () {
    const { name } = this.data()
    return `Hello, ${name}`
  }
})
```

It will work only on this route with this method, other routes won't be affected.

### Define middleware using the internal environment

This becomes a bit redundant, but if you like to run middlware using the internal enviroment,
you need to place as the `run` method:

 ```javascript
import { Meteor } from 'meteor/meteor'
import { createHTTPFactory } from 'meteor/leaonline:http-factory'

const createHttpRoute = createHTTPFactory()

// is is just some simple example validation
// of non-standard a-auth-token header
const isValidToken = req => req.headers['x-auth-token'] === Meteor.settings.xAuthToken
const simpleAuthInternal = function (req, res, next) {
  if (!isValidToken(req)) {
    // internally defined middleware can make use of the environment
    return this.error({
      code: 403,
      title: 'Permission Denied'
    })
  }
  next()
}

createHttpRoute({
  path: '/greetings',
  method: 'get',
  run: simpleAuthInternal
})
 
createHttpRoute({
  path: '/greetings',
  method: 'get',
  run: function () {
    const { name } = this.data()
    return `Hello, ${name}`
  }
})
```


## Codestyle

We use `standard` as code style and for linting.

##### via npm

```bash
$ npm install --global standard snazzy
$ standard | snazzy
```

##### via Meteor npm

```bash
$ meteor npm install --global standard snazzy
$ standard | snazzy
```


## Test

We use `meteortesting:mocha` to run our tests on the package.

##### Watch mode

```bash
$ TEST_WATCH=1 TEST_CLIENT=0 meteor test-packages ./ --driver-package meteortesting:mocha
```


## Changelog

- **1.0.1**
  - use `EJSON` to stringify results in order to comply with any formats, that
    can be resolved via EJSON

## License

MIT, see [LICENSE](./LICENSE)
