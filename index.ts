import Plugin, { tools } from '../../plugin'
import Client, { clientJson, clientOptions } from './tcp_client'

class sinClient extends Plugin {
  constructor() {
    super()
  }
  public name = 'sinsin的服务器'
  public description = '监听一些房间内抽奖信息'
  public version = '0.0.1'
  public author = 'lzghzr'
  public async load({ defaultOptions, whiteList }: { defaultOptions: options, whiteList: Set<string> }) {
    // 服务器信息
    defaultOptions.config['sinClient'] = ''
    defaultOptions.info['sinClient'] = {
      description: '监听服务器',
      tip: '用来监听房间抽奖消息, 格式为tcp://server#uid,key',
      type: 'string'
    }
    whiteList.add('sinClient')
    this.loaded = true
  }
  public async options({ options }: { options: options }) {
    const serverStr = <string>options.config['sinClient']
    if (serverStr !== '') {
      const serverReg = serverStr.match(/tcp:\/\/(?<server>.*):(?<port>.*)#(?<uid>.*),(?<key>.*)/)
      if (serverReg !== null) {
        const serverGroups = <{ server: string, port: string, uid: string, key: string }>serverReg.groups
        const clientOptions: clientOptions = {
          server: serverGroups.server,
          port: +serverGroups.port,
          uid: serverGroups.uid,
          key: serverGroups.key
        }
        const sinClient = new Client(clientOptions)
        sinClient.on('ALL_MSG', (message: clientJson) => {
          switch (message.type) {
            case 'error':
            case 'ok':
              tools.Log('服务器消息:', message.data.msg)
              break
            case 'raffle':
              const raffleData = message.data
              switch (raffleData.raffle_type) {
                case 'GUARD':
                  const lottery: lotteryMessage = {
                    cmd: 'lottery',
                    roomID: +raffleData.room_id,
                    id: +raffleData.raffle_id,
                    type: 'guard',
                    title: '舰队抽奖',
                    time: 1200
                  }
                  tools.emit('roomListener', lottery)
                  break
                case 'PK':
                  const pklottery: lotteryMessage = {
                    cmd: 'pklottery',
                    roomID: +raffleData.room_id,
                    id: +raffleData.raffle_id,
                    type: 'pk',
                    title: '恭喜主播大乱斗胜利',
                    time: 120
                  }
                  tools.emit('roomListener', pklottery)
                  break
                case 'STORM':
                  const beatStorm: beatStormMessage = {
                    cmd: 'beatStorm',
                    roomID: +raffleData.room_id,
                    id: +raffleData.raffle_id,
                    type: 'beatStorm',
                    title: '节奏风暴',
                    time: 60
                  }
                  tools.emit('roomListener', beatStorm)
                  break
              }
              break
          }
        })
        sinClient.Connect()
      }
    }
  }
}

export default new sinClient()