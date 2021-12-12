import MissingParameterError from "../errors/MissingParameterError";
import Message from "./Message";
import config from "../config";

export default class IntentUrl {
  action: string;
  getAuthChallengeUrl?: string;
  postAuthTokenUrl?: string;
  postPrepareSigningUrl?: string;
  postFinalizeSigningUrl?: string;
  applicationName?: string;
  actionDescription?: string;
  headers?: {
    [key: string]: string;
  };
  userInteractionTimeout?: number;
  serverRequestTimeout?: number;
  lang?: string;


  constructor(message: Message) {
    this.action = message.action;
    if (message.getAuthChallengeUrl) {
      this.getAuthChallengeUrl = message.getAuthChallengeUrl;
    }
    if (message.postAuthTokenUrl) {
      this.postAuthTokenUrl = message.postAuthTokenUrl;
    }
    if (message.headers) {
      this.headers = message.headers;
    }
    if (message.postPrepareSigningUrl) {
      this.postPrepareSigningUrl = message.postPrepareSigningUrl;
    }
    if (message.postFinalizeSigningUrl) {
      this.postFinalizeSigningUrl = message.postFinalizeSigningUrl;
    }
    if (message.applicationName) {
      this.applicationName = message.applicationName;
    }
    if (message.actionDescription) {
      this.actionDescription = message.actionDescription;
    }
    if (message.userInteractionTimeout) {
      this.userInteractionTimeout = message.userInteractionTimeout;
    }
    if (message.serverRequestTimeout) {
      this.serverRequestTimeout = message.serverRequestTimeout;
    }
    if (message.lang) {
      this.lang = message.lang;
    }
    this.validate();
  }

  validate(): void {
    if (this.action == null || ((this.getAuthChallengeUrl == null || this.postAuthTokenUrl == null) && (this.postFinalizeSigningUrl == null || this.postPrepareSigningUrl == null))) {
      throw new MissingParameterError("Missing parameters for IntentUrl.");
    }
  }

  toString(): string {
    let url = config.AUTH_APP_INTENT_URL_BASE;

    url += "?action=\"" + this.action + "\"";

    url += this.getAuthChallengeUrl ? "&getAuthChallengeUrl=\"" + encodeURIComponent(this.getAuthChallengeUrl) + "\"" : "";
    url += this.postAuthTokenUrl ? "&postAuthTokenUrl=\"" + encodeURIComponent(this.postAuthTokenUrl) + "\"" : "";
    url += this.postPrepareSigningUrl ? "&postPrepareSigningUrl=\"" + encodeURIComponent(this.postPrepareSigningUrl) + "\"" : "";
    url += this.postFinalizeSigningUrl ? "&postFinalizeSigningUrl=\"" + encodeURIComponent(this.postFinalizeSigningUrl) + "\"" : "";
    url += this.applicationName ? "&applicationName=\"" + encodeURIComponent(this.applicationName) + "\"" : "";
    url += this.actionDescription ? "&actionDescription=\"" + encodeURIComponent(this.actionDescription) + "\"" : "";
    url += this.headers ? "&headers=\"" + JSON.stringify(this.headers) + "\"" : "";
    url += this.userInteractionTimeout ? "&userInteractionTimeout=\"" + this.userInteractionTimeout + "\"" : "";
    url += this.serverRequestTimeout ? "&serverRequestTimeout=\"" + this.serverRequestTimeout + "\"" : "";
    url += this.lang ? "&lang=\"" + this.lang + "\"" : "";

    return url;
  }
}
