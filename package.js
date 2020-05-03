/* eslint-env meteor */
Package.describe({
  name: 'leaonline:webapp-factory',
  version: '1.0.0',
  // Brief, one-line summary of the package.
  summary: '',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
})

Package.onUse(function (api) {
  api.versionsFrom('1.6')
  api.use('ecmascript')
  api.use('leaonline:webapp@1.0.0')
  api.mainModule('webapp-factory.js')
})

Package.onTest(function (api) {
  Npm.depends({
    chai: '4.2.0',
    'simpl-schema': '1.6.2',
    'body-parser': '1.19.0'
  })

  api.use('ecmascript')
  api.use('random')
  api.use('mongo')
  api.use('check')
  api.use('meteortesting:mocha')
  api.use('leaonline:webapp-factory')
  api.mainModule('webapp-factory-tests.js')
})
