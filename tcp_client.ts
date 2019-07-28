import { Socket } from 'net'
import { EventEmitter } from 'events'
import { tools } from '../../plugin'
/**
 * 错误类型
 *
 * @enum {number}
 */
enum errorStatus {
  'client',
  'data',
  'timeout',
}
/**
 * 客户端, 用于连接服务器和发送事件
 *
 * @class client
 * @extends {EventEmitter}
 */
class client extends EventEmitter {
  /**
   * Creates an instance of client.
   * @param {clientOptions} options
   * @memberof client
   */
  constructor(options: clientOptions) {
    super()
    this.server = options.server
    this.port = options.port
    this.uid = options.uid
    this.key = options.key
  }
  /**
   * 用户UID
   *
   * @type {string}
   * @memberof client
   */
  public uid: string
  /**
   * 连接使用的key
   *
   * @type {string}
   * @memberof client
   */
  public key: string
  /**
   * 当前连接的服务器
   *
   * @type {string}
   * @memberof client
   */
  public server: string
  /**
   * 当前连接的服务器端口
   *
   * @protected
   * @type {number}
   * @memberof client
   */
  public port: number
  /**
   * 是否已经连接到服务器
   * 为了避免不必要的麻烦, 禁止外部修改
   *
   * @protected
   * @type {boolean}
   * @memberof client
   */
  protected _connected: boolean = false
  /**
   * 是否已经连接到服务器
   *
   * @readonly
   * @type {boolean}
   * @memberof client
   */
  public get connected(): boolean {
    return this._connected
  }
  /**
   * 全局计时器, 负责除心跳超时的其他任务, 便于停止
   *
   * @protected
   * @type {NodeJS.Timer}
   * @memberof client
   */
  protected _Timer!: NodeJS.Timer
  /**
   * 心跳超时
   *
   * @protected
   * @type {NodeJS.Timer}
   * @memberof client
   */
  protected _timeout!: NodeJS.Timer
  /**
   * 客户端, 与服务器进行通讯
   *
   * @protected
   * @type {Socket }
   * @memberof client
   */
  protected _client!: Socket
  /**
   * 缓存数据
   *
   * @private
   * @type {Buffer}
   * @memberof client
   */
  private __data!: Buffer
  /**
   * 错误类型
   *
   * @static
   * @type {typeof errorStatus}
   * @memberof client
   */
  public static readonly errorStatus: typeof errorStatus = errorStatus
  /**
   * 连接到指定服务器
   *
   * @param {clientOptions} [options]
   * @memberof client
   */
  public async Connect(options?: clientOptions) {
    if (this._connected) return
    this._connected = true
    if (options !== undefined) {
      this.server = options.server
      this.port = options.port
      this.uid = options.uid
      this.key = options.key
    }
    this._ClientConnect()
  }
  /**
   * 断开与服务器的连接
   *
   * @memberof client
   */
  public Close() {
    if (!this._connected) return
    this._connected = false
    clearTimeout(this._Timer)
    clearTimeout(this._timeout)
    this._client.end()
    this._client.destroy()
    this._client.removeAllListeners()
    // 发送关闭消息
    this.emit('close')
  }
  /**
   * 客户端连接
   *
   * @protected
   * @memberof client
   */
  protected _ClientConnect() {
    this._client = new Socket().connect(this.port, this.server)
      .on('error', error => this._ClientErrorHandler(<clientError>{ status: errorStatus.client, error: error }))
      .on('connect', () => this._ClientConnectHandler())
      .on('data', data => this._ClientDataHandler(data))
      .on('end', () => this.Close())
  }
  /**
   * 客户端错误
   *
   * @protected
   * @param {ClientError} errorInfo
   * @memberof client
   */
  protected _ClientErrorHandler(errorInfo: ClientError) {
    // 'error' 为关键词, 为了避免麻烦不使用
    this.emit('ClientError', errorInfo)
    if (errorInfo.status !== client.errorStatus.data) this.Close()
  }
  /**
   * 向服务器发送自定义握手数据
   *
   * @protected
   * @memberof client
   */
  protected _ClientConnectHandler() {
    const data = JSON.stringify({ code: 0, msg: '', data: { key: this.key, uid: this.uid } })
    this._Timer = setTimeout(() => this._ClientHeart(), 1000)
    this._ClientSendData(data)
  }
  /**
   * 心跳包
   *
   * @protected
   * @memberof client
   */
  protected _ClientHeart() {
    if (!this._connected) return
    this._timeout = setTimeout(() => {
      const errorInfo: clientError = { status: errorStatus.timeout, error: new Error('心跳超时') }
      this._ClientErrorHandler(errorInfo)
    }, 30 * 1000)
    this._Timer = setTimeout(() => this._ClientHeart(), 600 * 1000)
    this._ClientSendData('')
  }
  /**
   * 向服务器发送数据
   *
   * @protected
   * @param {string} data 数据
   * @memberof client
   */
  protected _ClientSendData(data: string) {
    const bufferData = Buffer.from(data + '\r\n')
    const bodyLen = bufferData.length
    const fullData = Buffer.allocUnsafe(bodyLen + 4)
    fullData.writeInt32BE(bodyLen, 0)
    bufferData.copy(fullData, 4)
    this._client.write(fullData)
  }
  /**
   * 解析从服务器接收的数据
   * 抛弃循环, 使用递归
   *
   * @protected
   * @param {Buffer} data
   * @memberof client
   */
  protected async _ClientDataHandler(data: Buffer) {
    // 拼接数据
    if (this.__data !== undefined) {
      // 把数据合并到缓存
      this.__data = Buffer.concat([this.__data, data])
      const dataLen = this.__data.length
      const packageLen = this.__data.readInt32BE(0) + 4
      if (dataLen >= packageLen) {
        data = this.__data
        delete this.__data
      }
      else return
    }
    // 读取数据
    const dataLen = data.length
    if (dataLen < 4 || dataLen > 0x100000) {
      // 抛弃长度过短和过长的数据
      const errorInfo: dataError = { status: errorStatus.data, error: new TypeError('数据长度异常'), data }
      return this._ClientErrorHandler(errorInfo)
    }
    const packageLen = data.readInt32BE(0) + 4
    if (packageLen < 4 || packageLen > 0x100000) {
      // 抛弃包长度异常的数据
      const errorInfo: dataError = { status: errorStatus.data, error: new TypeError('包长度异常'), data }
      return this._ClientErrorHandler(errorInfo)
    }
    // 等待拼接数据
    if (dataLen < packageLen) return this.__data = data
    this._ParseClientData(data.slice(0, packageLen))
    if (dataLen > packageLen) this._ClientDataHandler(data.slice(packageLen))
  }
  /**
   * 解析消息
   *
   * @protected
   * @param {Buffer} data
   * @memberof client
   */
  protected async _ParseClientData(data: Buffer) {
    if (data.length === 4) return clearTimeout(this._timeout)
    const dataJson = await tools.JSONparse<clientJson>(data.toString('UTF-8', 4))
    if (dataJson !== undefined) this._ClientData(dataJson)
    else {
      // 格式化消息失败则跳过
      const errorInfo: dataError = { status: errorStatus.data, error: new TypeError('意外的信息'), data }
      this._ClientErrorHandler(errorInfo)
    }
  }
  /**
   * 发送消息事件
   *
   * @protected
   * @param {clientJson} dataJson
   * @memberof client
   */
  protected _ClientData(dataJson: clientJson) {
    this.emit('ALL_MSG', dataJson)
  }
}

/**
 * 客户端, 可自动重连
 * 因为之前重连逻辑写在一起实在太乱了, 所以独立出来
 *
 * @class clientRE
 * @extends {clientRE}
 */
class clientRE extends client {
  /**
   * Creates an instance of clientRE.
   * @param {clientOptions} options
   * @memberof clientRE
   */
  constructor(options: clientOptions) {
    super(options)
    this.on('ClientError', error => tools.ErrorLog(error))
    this.on('close', () => this._ClientReConnect())
  }
  /**
   * 重连次数, 以五次为阈值
   *
   * @type {number}
   * @memberof clientRE
   */
  public reConnectTime: number = 0
  /**
   * 重新连接
   *
   * @private
   * @memberof clientRE
   */
  private _ClientReConnect() {
    this._Timer = setTimeout(() => {
      if (this.reConnectTime >= 5) {
        this.reConnectTime = 0
        this._DelayReConnect()
      }
      else {
        this.reConnectTime++
        this.Connect({ server: this.server, port: this.port, uid: this.uid, key: this.key })
      }
    }, 3 * 1000)
  }
  /**
   * 5分钟后重新连接
   *
   * @private
   * @memberof clientRE
   */
  private _DelayReConnect() {
    this._Timer = setTimeout(() => this.Connect(), 5 * 60 * 1000)
    tools.ErrorLog('尝试重连弹幕服务器失败，五分钟后再次重新连接')
  }
}

export default clientRE

export interface clientJson {
  code: number
  data: clientJsonData
  type: 'error' | 'ok' | 'raffle' | string
}
interface clientJsonData {
  msg?: string
  raffle_id: string
  room_id: string
  raffle_type: 'GUARD' | 'PK' | 'STORM' | string
  end_time: number
  latest_update_rooms_time: number
}

export interface clientOptions {
  server: string
  port: number
  uid: string
  key: string
}
interface clientError {
  status: errorStatus.client | errorStatus.timeout
  error: Error
}
interface dataError {
  status: errorStatus.data
  error: TypeError
  data: Buffer
}
type ClientError = clientError | dataError