/* @flow */
import queryString from 'query-string'
import { AppConfig } from './appConfig'
import type { SessionOptions } from './sessionData'
import {
  LocalStorageStore,
  SessionDataStore,
  InstanceDataStore
} from './sessionStore'
import {
  redirectToSignInImpl,
  redirectToSignInWithAuthRequestImpl,
  handlePendingSignInImpl,
  loadUserDataImpl
} from './authApp'

import {
  makeAuthRequestImpl,
  generateTransitKey
} from './authMessages'

import {
  decryptContentImpl,
  encryptContentImpl,
  getFileImpl,
  putFileImpl,
  listFilesImpl
} from '../storage'

import type {
  PutFileOptions
} from '../storage'

import {
  nextHour
} from '../utils'
import {
  MissingParameterError,
  InvalidStateError
} from '../errors'
import { Logger } from '../logger'

/**
 * Represents an instance of a signed in user for a particular app.
 *
 * A signed in user has access to two major pieces of information
 * about the user, the user's private key for that app and the location
 * of the user's gaia storage bucket for the app.
 *
 * A user can be signed in either directly through the interactive
 * sign in process or by directly providing the app private key.
 * @type {UserSession}
 */
export class UserSession {
  appConfig: AppConfig

  store: SessionDataStore

  constructor(options: {appConfig?: AppConfig,
    sessionStore?: SessionDataStore,
    sessionOptions?: SessionOptions }) {
    let runningInBrowser = true

    if (typeof window === 'undefined') {
      runningInBrowser = false
    }

    Logger.debug(`UserSession: runningInBrowser: ${runningInBrowser ? 'yes' : 'no'}`)

    if (options && options.appConfig) {
      this.appConfig = options.appConfig
    } else if (runningInBrowser) {
      this.appConfig = new AppConfig()
    } else {
      throw new MissingParameterError('You need to specify options.appConfig')
    }

    if (options && options.sessionStore) {
      this.store = options.sessionStore
    } else if (runningInBrowser) {
      if (options) {
        this.store = new LocalStorageStore(options.sessionOptions)
      } else {
        this.store = new LocalStorageStore()
      }
    } else if (options) {
      this.store = new InstanceDataStore(options.sessionOptions)
    } else {
      this.store = new InstanceDataStore()
    }
  }

  /* AUTHENTICATION */

  /**
   * Generates an authentication request and redirects the user to the Blockstack
   * browser to approve the sign in request.
   *
   * Please note that this requires that the web browser properly handles the
   * `blockstack:` URL protocol handler.
   *
   * Most applications should use this
   * method for sign in unless they require more fine grained control over how the
   * authentication request is generated. If your app falls into this category,
   * use `generateAndStoreTransitKey`, `makeAuthRequest`,
   * and `redirectToSignInWithAuthRequest` to build your own sign in process.
   *
   * @return {void}
   */
  redirectToSignIn() {
    return redirectToSignInImpl(this)
  }

  /**
   * Redirects the user to the Blockstack browser to approve the sign in request
   * given.
   *
   * The user is redirected to the authenticator URL specified in the `AppConfig`
   * if the `blockstack:` protocol handler is not detected.
   * Please note that the protocol handler detection
   * does not work on all browsers.
   * @param  {String} authRequest - the authentication request generated by `makeAuthRequest`
   * @return {void}
   */
  redirectToSignInWithAuthRequest(authRequest: string) {
    return redirectToSignInWithAuthRequestImpl(this, authRequest)
  }

  /**
   * Generates an authentication request that can be sent to the Blockstack
   * browser for the user to approve sign in. This authentication request can
   * then be used for sign in by passing it to the `redirectToSignInWithAuthRequest`
   * method.
   *
   * *Note: This method should only be used if you want to roll your own authentication
   * flow. Typically you'd use `redirectToSignIn` which takes care of this
   * under the hood.*
   * @param {string} transitKey - hex-encoded transit key
   * @param {Number} expiresAt - the time at which this request is no longer valid
   * @return {String} the authentication request
   * @private
   */
  makeAuthRequest(transitKey: string,
                  expiresAt: number = nextHour().getTime()): string {
    const appConfig = this.appConfig

    if (!appConfig) {
      throw new InvalidStateError('Missing AppConfig')
    }
    const redirectURI = appConfig.redirectURI()
    const manifestURI = appConfig.manifestURI()
    const scopes = appConfig.scopes
    const appDomain = appConfig.appDomain
    return makeAuthRequestImpl(transitKey, redirectURI, manifestURI, scopes, appDomain, expiresAt)
  }

  /**
   * Generates a ECDSA keypair to
   * use as the ephemeral app transit private key
   * and store in the session
   * @return {String} the hex encoded private key
   *
   */
  generateAndStoreTransitKey(): string {
    const sessionData = this.store.getSessionData()
    const transitKey = generateTransitKey()
    sessionData.transitKey = transitKey
    this.store.setSessionData(sessionData)
    return transitKey
  }

  /**
   * Retrieve the authentication token from the URL query
   * @return {String} the authentication token if it exists otherwise `null`
   */
  getAuthResponseToken(): string {
    const queryDict = queryString.parse(location.search)
    return queryDict.authResponse ? queryDict.authResponse : ''
  }

  /**
   * Check if there is a authentication request that hasn't been handled.
   * @return {Boolean} `true` if there is a pending sign in, otherwise `false`
   */
  isSignInPending() {
    return !!this.getAuthResponseToken()
  }

  /**
   * Check if a user is currently signed in.
   * @return {Boolean} `true` if the user is signed in, `false` if not.
   */
  isUserSignedIn() {
    return !!this.store.getSessionData().userData
  }

  /**
   * Try to process any pending sign in request by returning a `Promise` that resolves
   * to the user data object if the sign in succeeds.
   *
   * @param {String} authResponseToken - the signed authentication response token
   * @return {Promise} that resolves to the user data object if successful and rejects
   * if handling the sign in request fails or there was no pending sign in request.
   */
  handlePendingSignIn(authResponseToken: string = this.getAuthResponseToken()) {
    return handlePendingSignInImpl(this, authResponseToken)
  }

  /**
   * Retrieves the user data object. The user's profile is stored in the key `profile`.
   * @return {Object} User data object.
   */
  loadUserData() {
    return loadUserDataImpl(this)
  }


  /**
   * Sign the user out
   * @return {void}
   */
  signUserOut() {
    this.store.deleteSessionData()
  }

  //
  //
  // /* PROFILES */
  // extractProfile
  // wrapProfileToken
  // signProfileToken
  // verifyProfileToken
  // validateProofs
  // lookupProfile


  /* STORAGE */

  /**
   * Encrypts the data provided with the app public key.
   * @param {String|Buffer} content - data to encrypt
   * @param {Object} [options=null] - options object
   * @param {String} options.publicKey - the hex string of the ECDSA public
   * key to use for encryption. If not provided, will use user's appPrivateKey.
   * @return {String} Stringified ciphertext object
   */
  encryptContent(content: string | Buffer,
                 options?: {publicKey?: string}) {
    return encryptContentImpl(this, content, options)
  }

  /**
   * Decrypts data encrypted with `encryptContent` with the
   * transit private key.
   * @param {String|Buffer} content - encrypted content.
   * @param {Object} [options=null] - options object
   * @param {String} options.privateKey - the hex string of the ECDSA private
   * key to use for decryption. If not provided, will use user's appPrivateKey.
   * @return {String|Buffer} decrypted content.
   */
  decryptContent(content: string, options?: {privateKey?: ?string}) {
    return decryptContentImpl(this, content, options)
  }

  /**
   * Stores the data provided in the app's data store to to the file specified.
   * @param {String} path - the path to store the data in
   * @param {String|Buffer} content - the data to store in the file
   * @param {Object} [options=null] - options object
   * @param {Boolean|String} [options.encrypt=true] - encrypt the data with the app private key
   *                                                  or the provided public key
   * @param {Boolean} [options.sign=false] - sign the data using ECDSA on SHA256 hashes with
   *                                         the app private key
   * @return {Promise} that resolves if the operation succeed and rejects
   * if it failed
   */
  putFile(path: string, content: string | Buffer, options?: PutFileOptions) {
    return putFileImpl(this, path, content, options)
  }

  /**
   * Retrieves the specified file from the app's data store.
   * @param {String} path - the path to the file to read
   * @param {Object} [options=null] - options object
   * @param {Boolean} [options.decrypt=true] - try to decrypt the data with the app private key
   * @param {String} options.username - the Blockstack ID to lookup for multi-player storage
   * @param {Boolean} options.verify - Whether the content should be verified, only to be used
   * when `putFile` was set to `sign = true`
   * @param {String} options.app - the app to lookup for multi-player storage -
   * defaults to current origin
   * @param {String} [options.zoneFileLookupURL=null] - The URL
   * to use for zonefile lookup. If falsey, this will use the
   * blockstack.js's getNameInfo function instead.
   * @returns {Promise} that resolves to the raw data in the file
   * or rejects with an error
   */
  getFile(path: string, options?: {
      decrypt?: boolean,
      verify?: boolean,
      username?: string,
      app?: string,
      zoneFileLookupURL?: ?string
    }) {
    return getFileImpl(this, path, options)
  }

  /**
   * List the set of files in this application's Gaia storage bucket.
   * @param {function} callback - a callback to invoke on each named file that
   * returns `true` to continue the listing operation or `false` to end it
   * @return {Promise} that resolves to the number of files listed
   */
  listFiles(callback: (name: string) => boolean) : Promise<number> {
    return listFilesImpl(this, callback)
  }

  /**
   * Deletes the specified file from the app's data store. Currently not implemented.
   * @param {String} path - the path to the file to delete
   * @returns {Promise} that resolves when the file has been removed
   * or rejects with an error
   * @private
   */
  deleteFile(path: string) {
    Promise.reject(new Error(`Delete of ${path} not supported by gaia hubs`))
  }
}
