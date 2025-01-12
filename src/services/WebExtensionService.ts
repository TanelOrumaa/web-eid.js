/*
 * Copyright (c) Estonian Information System Authority
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import {deserializeError} from "../utils/errorSerializer";
import config from "../config";
import Message from "../models/Message";
import PendingMessage from "../models/PendingMessage";
import ActionPendingError from "../errors/ActionPendingError";
import ActionTimeoutError from "../errors/ActionTimeoutError";
import ContextInsecureError from "../errors/ContextInsecureError";
import ExtensionUnavailableError from "../errors/ExtensionUnavailableError";
import IntentUrl from "../models/IntentUrl";
import AuthAppNotInstalledError from "../errors/AuthAppNotInstalledError";
import Action from "../models/Action";
import {QrCode} from "../models/qrcode/QrCode";
import {Ecc} from "../models/qrcode/Ecc";
import {toSvgString} from "../utils/qrcode";
import ProtocolInsecureError from "../errors/ProtocolInsecureError";
import MissingParameterError from "../errors/MissingParameterError";
import * as https from "https";
import * as http from "http";
import {isAndroidDevice} from "../web-eid";
import ErrorCode from "../errors/ErrorCode";
import ServerRejectedError from "../errors/ServerRejectedError";
import ServerTimeoutError from "../errors/ServerTimeoutError";
import UserCancelledError from "../errors/UserCancelledError";
import UserPinError from "../errors/UserPinError";
import UnknownError from "../errors/UnknownError";

export default class WebExtensionService {
  private queue: PendingMessage[] = [];

  constructor() {
    window.addEventListener("message", (event) => this.receive(event));
  }

  private receive(event: { data: Message }): void {
    if (!/^web-eid:/.test(event.data?.action)) return;

    const message = event.data;
    const suffix = message.action?.match(/success$|failure$|ack$/)?.[0];
    const initialAction = this.getInitialAction(message.action);
    const pending = this.getPendingMessage(initialAction);

    if (suffix === "ack") {
      console.log("ack message", message);
      console.log("ack pending", pending?.message.action);
      console.log("ack queue", JSON.stringify(this.queue));
    }

    if (pending) {
      switch (suffix) {
        case "ack": {
          clearTimeout(pending.ackTimer);

          break;
        }

        case "success": {
          pending.resolve?.(message);
          this.removeFromQueue(initialAction);

          break;
        }

        case "failure": {
          pending.reject?.(message.error ? deserializeError(message.error) : message);
          this.removeFromQueue(initialAction);

          break;
        }
      }
    }
  }

  send<T extends Message>(message: Message, timeout: number): Promise<T> {
    if (this.getPendingMessage(message.action)) {
      return Promise.reject(new ActionPendingError());

    } else if (!window.isSecureContext) {
      return Promise.reject(new ContextInsecureError());

    } else {
      const pending: PendingMessage = { message };

      this.queue.push(pending);

      pending.promise = new Promise((resolve, reject) => {
        pending.resolve = resolve;
        pending.reject = reject;
      });

      pending.ackTimer = window.setTimeout(
        () => this.onAckTimeout(pending),
        config.EXTENSION_HANDSHAKE_TIMEOUT,
      );

      pending.replyTimer = window.setTimeout(
        () => this.onReplyTimeout(pending),
        timeout,
      );

      this.publishMessage(message, timeout);

      return pending.promise as Promise<T>;
    }
  }

  publishMessage(message: Message, timeout: number): void {
    if (message.useAuthApp && message.useAuthApp == true) {
      if (isAndroidDevice()) {
        // Launch auth app.
        console.log("Launching auth app");
        this.launchAuthApp(message);
      } else {
        // Display QR code.
        this.displayQRCode(message);
      }
      console.log("Polling for success.");
      this.pollForLoginSuccess(message, timeout).then(
        (req) => {
          req.on("response", (res) => {
            if (res.statusCode == 200) {
              console.log("Polling request successful: " + res.statusCode);
              window.postMessage({ action: this.getRelevantSuccessAction(message) }, location.origin);
            } else {
              console.log("Polling request unsuccessful: " + res.statusCode);
              let error;
              switch (res.statusCode) {
                case 400:
                  error = new MissingParameterError("A parameter is missing!");
                  break;
                case 403:
                  error = new ServerRejectedError();
                  break;
                case 408:
                  error = new ServerTimeoutError();
                  break;
                case 444:
                  error = new UserCancelledError();
                  break;
                case 449:
                  error = new UserPinError();
                  break;
                default:
                  error = new UnknownError("Error code: " + res.statusCode);
              }

              window.postMessage({ action: this.getRelevantErrorAction(message), error: error }, location.origin);
            }
          }).on("error", (err) => {
            console.log("Server unreachable: " + err);
            window.postMessage( { action: this.getRelevantErrorAction(message), error: new ServerRejectedError() }, location.origin);
          });
        }
      );
    } else {
      // Use ID-card reader.
      window.postMessage(message, "*");
    }

  }

  launchAuthApp(message: Message): void {
    const intentUrl = new IntentUrl(message);

    // Since deeplink gives no feedback about app launch, check if browser window lost focus.
    document.addEventListener("visibilitychange", function sendAckMessage(this: WebExtensionService) {
      if (document.hidden) {
        // Send acknowledge message to itself.
        window.postMessage({ action: this.getRelevantAckAction(message) }, location.origin);

        setTimeout(() => document.removeEventListener("visibilitychange", sendAckMessage), config.EXTENSION_HANDSHAKE_TIMEOUT);
      }
    }.bind(this));

    window.location.href = intentUrl.toString();
  }

  displayQRCode(message: Message): void {
    const intentUrl = new IntentUrl(message);

    const qrCode = QrCode;

    const qr0 = qrCode.encodeText(intentUrl.toString(), Ecc.MEDIUM);

    const svg = toSvgString(qr0, 24, "#FFF", "#000");

    const canvas = document.getElementById("canvas");
    if (canvas) {
      canvas.innerHTML = svg;
    }
    window.postMessage({ action: this.getRelevantAckAction(message) }, location.origin);
  }

  async pollForLoginSuccess(message: Message, timeout: number): Promise<http.ClientRequest> {

    if (message.getAuthSuccessUrl) {
      if (!message.getAuthSuccessUrl.startsWith("https://")) {
        throw new ProtocolInsecureError(`HTTPS required for getAuthSuccessUrl ${message.getAuthSuccessUrl}`);
      }

      console.log("Polling for success.");

      const headers: http.OutgoingHttpHeaders = message.headers;

      const url = new URL(message.getAuthSuccessUrl);

      const host = url.hostname;
      const port = url.port;
      const path = url.pathname;

      const options: http.RequestOptions = {
        host:    host,
        port:    port,
        path:    path,
        method:  "GET",
        headers: headers,
        timeout: timeout,
      };

      return https.get(options, () => {
        console.log("Polling request response received.");
      });
    } else {
      throw new MissingParameterError("getAuthSuccessUrl missing for Android auth app authentication option.");
    }
  }

  async throwAfterTimeout(milliseconds: number, error: Error): Promise<void> {
    await this.sleep(milliseconds);
    throw error;
  }

  async sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(), milliseconds);
    });
  }

  getRelevantAckAction(message: Message): Action {
    let ackAction;
    switch (message.action) {
      case Action.AUTHENTICATE:
        ackAction = Action.AUTHENTICATE_ACK;
        break;
      case Action.SIGN:
        ackAction = Action.SIGN_ACK;
        break;
      case Action.STATUS:
        ackAction = Action.STATUS_ACK;
        break;
      default:
        ackAction = Action.STATUS_ACK;
        break;
    }
    return ackAction;
  }

  getRelevantSuccessAction(message: Message): Action {
    let ackAction;
    switch (message.action) {
      case Action.AUTHENTICATE:
        ackAction = Action.AUTHENTICATE_SUCCESS;
        break;
      case Action.SIGN:
        ackAction = Action.SIGN_SUCCESS;
        break;
      case Action.STATUS:
        ackAction = Action.STATUS_SUCCESS;
        break;
      default:
        ackAction = Action.STATUS_SUCCESS;
        break;
    }
    return ackAction;
  }

  getRelevantErrorAction(message: Message): Action {
    let rejectAction;
    switch (message.action) {
      case Action.AUTHENTICATE:
        rejectAction = Action.AUTHENTICATE_FAILURE;
        break;
      case Action.SIGN:
        rejectAction = Action.SIGN_FAILURE;
        break;
      case Action.STATUS:
        rejectAction = Action.STATUS_FAILURE;
        break;
      default:
        rejectAction = Action.STATUS_FAILURE;
        break;
    }
    return rejectAction;
  }

  onReplyTimeout(pending: PendingMessage): void {
    console.log("onReplyTimeout", pending.message.action);
    pending.reject?.(new ActionTimeoutError());

    this.removeFromQueue(pending.message.action);
  }

  onAckTimeout(pending: PendingMessage): void {
    console.log("onAckTimeout", pending.message.action);
    if (pending.message.useAuthApp && pending.message.useAuthApp == true) {
      pending.reject?.(new AuthAppNotInstalledError());
    } else {
      pending.reject?.(new ExtensionUnavailableError());
    }

    this.removeFromQueue(pending.message.action);
    clearTimeout(pending.replyTimer);
  }

  getPendingMessage(action: string): PendingMessage | undefined {
    return this.queue.find((pm) => {
      return pm.message.action === action;
    });
  }

  getInitialAction(action: string): string {
    return action.replace(/-success$|-failure$|-ack$/, "");
  }

  removeFromQueue(action: string): void {
    const pending = this.getPendingMessage(action);

    clearTimeout(pending?.replyTimer);

    this.queue = this.queue.filter((pending) => (
      pending.message.action !== action
    ));
  }


}
