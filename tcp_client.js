"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const net_1 = require("net");
const events_1 = require("events");
const plugin_1 = require("../../plugin");
var errorStatus;
(function (errorStatus) {
    errorStatus[errorStatus["client"] = 0] = "client";
    errorStatus[errorStatus["data"] = 1] = "data";
    errorStatus[errorStatus["timeout"] = 2] = "timeout";
})(errorStatus || (errorStatus = {}));
class client extends events_1.EventEmitter {
    constructor(options) {
        super();
        this._connected = false;
        this.server = options.server;
        this.port = options.port;
        this.uid = options.uid;
        this.key = options.key;
    }
    get connected() {
        return this._connected;
    }
    async Connect(options) {
        if (this._connected)
            return;
        this._connected = true;
        if (options !== undefined) {
            this.server = options.server;
            this.port = options.port;
            this.uid = options.uid;
            this.key = options.key;
        }
        this._ClientConnect();
    }
    Close() {
        if (!this._connected)
            return;
        this._connected = false;
        clearTimeout(this._Timer);
        clearTimeout(this._timeout);
        this._client.end();
        this._client.destroy();
        this._client.removeAllListeners();
        this.emit('close');
    }
    _ClientConnect() {
        this._client = new net_1.Socket().connect(this.port, this.server)
            .on('error', error => this._ClientErrorHandler({ status: errorStatus.client, error: error }))
            .on('connect', () => this._ClientConnectHandler())
            .on('data', data => this._ClientDataHandler(data))
            .on('end', () => this.Close());
    }
    _ClientErrorHandler(errorInfo) {
        this.emit('ClientError', errorInfo);
        if (errorInfo.status !== client.errorStatus.data)
            this.Close();
    }
    _ClientConnectHandler() {
        const data = JSON.stringify({ code: 0, msg: '', data: { key: this.key, uid: this.uid } });
        this._Timer = setTimeout(() => this._ClientHeart(), 1000);
        this._ClientSendData(data);
    }
    _ClientHeart() {
        if (!this._connected)
            return;
        this._timeout = setTimeout(() => {
            const errorInfo = { status: errorStatus.timeout, error: new Error('心跳超时') };
            this._ClientErrorHandler(errorInfo);
        }, 30 * 1000);
        this._Timer = setTimeout(() => this._ClientHeart(), 600 * 1000);
        this._ClientSendData('');
    }
    _ClientSendData(data) {
        const bufferData = Buffer.from(data + '\r\n');
        const bodyLen = bufferData.length;
        const fullData = Buffer.allocUnsafe(bodyLen + 4);
        fullData.writeInt32BE(bodyLen, 0);
        bufferData.copy(fullData, 4);
        this._client.write(fullData);
    }
    async _ClientDataHandler(data) {
        if (this.__data !== undefined) {
            this.__data = Buffer.concat([this.__data, data]);
            const dataLen = this.__data.length;
            const packageLen = this.__data.readInt32BE(0) + 4;
            if (dataLen >= packageLen) {
                data = this.__data;
                delete this.__data;
            }
            else
                return;
        }
        const dataLen = data.length;
        if (dataLen < 4 || dataLen > 0x100000) {
            const errorInfo = { status: errorStatus.data, error: new TypeError('数据长度异常'), data };
            return this._ClientErrorHandler(errorInfo);
        }
        const packageLen = data.readInt32BE(0) + 4;
        if (packageLen < 4 || packageLen > 0x100000) {
            const errorInfo = { status: errorStatus.data, error: new TypeError('包长度异常'), data };
            return this._ClientErrorHandler(errorInfo);
        }
        if (dataLen < packageLen)
            return this.__data = data;
        this._ParseClientData(data.slice(0, packageLen));
        if (dataLen > packageLen)
            this._ClientDataHandler(data.slice(packageLen));
    }
    async _ParseClientData(data) {
        if (data.length === 4)
            return clearTimeout(this._timeout);
        const dataJson = await plugin_1.tools.JSONparse(data.toString('UTF-8', 4));
        if (dataJson !== undefined)
            this._ClientData(dataJson);
        else {
            const errorInfo = { status: errorStatus.data, error: new TypeError('意外的信息'), data };
            this._ClientErrorHandler(errorInfo);
        }
    }
    _ClientData(dataJson) {
        this.emit('ALL_MSG', dataJson);
    }
}
client.errorStatus = errorStatus;
class clientRE extends client {
    constructor(options) {
        super(options);
        this.reConnectTime = 0;
        this.on('ClientError', error => plugin_1.tools.ErrorLog(error));
        this.on('close', () => this._ClientReConnect());
    }
    _ClientReConnect() {
        this._Timer = setTimeout(() => {
            if (this.reConnectTime >= 5) {
                this.reConnectTime = 0;
                this._DelayReConnect();
            }
            else {
                this.reConnectTime++;
                this.Connect({ server: this.server, port: this.port, uid: this.uid, key: this.key });
            }
        }, 3 * 1000);
    }
    _DelayReConnect() {
        this._Timer = setTimeout(() => this.Connect(), 5 * 60 * 1000);
        plugin_1.tools.ErrorLog('尝试重连弹幕服务器失败，五分钟后再次重新连接');
    }
}
exports.default = clientRE;
