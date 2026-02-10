/* eslint-env meteor */
Package.describe({
  name: 'leaonline:http-factory',
  version: '2.0.0',
  // Brief, one-line summary of the package.
  summary: 'Create Meteor express HTTP middleware. Lightweight. Simple.',
  // URL to the Git repository containing the source code for this package.
  git: 'https://github.com/leaonline/http-factory.git',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
})

Package.onUse(function (api) {
  api.versionsFrom(['1.6', '2.8.1', '3.0.1', '3.4'])
  api.use(['ecmascript', 'ejson', 'webapp'], 'server')
  api.mainModule('http-factory.js', 'server')
})

Package.onTest(function (api) {
  api.versionsFrom(['1.6', '2.8.1', '3.0.1', '3.4'])
  Npm.depends({
    chai: '4.2.0',
    'simpl-schema': '1.13.1',
    'body-parser': '1.20.2'
  })

  api.use('ecmascript')
  api.use('random')
  api.use('mongo')
  api.use('check')
  api.use('meteortesting:mocha')
  api.use('leaonline:http-factory')
  api.mainModule('http-factory-tests.js', 'server')
})
