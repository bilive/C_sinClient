"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const plugin_1 = __importStar(require("../../plugin"));
const tcp_client_1 = __importDefault(require("./tcp_client"));
class sinClient extends plugin_1.default {
    constructor() {
        super();
        this.name = 'sinsin的服务器';
        this.description = '监听一些房间内抽奖信息';
        this.version = '0.0.1';
        this.author = 'lzghzr';
    }
    async load({ defaultOptions, whiteList }) {
        defaultOptions.config['sinClient'] = '';
        defaultOptions.info['sinClient'] = {
            description: '监听服务器',
            tip: '用来监听房间抽奖消息, 格式为tcp://server#uid,key',
            type: 'string'
        };
        whiteList.add('sinClient');
        this.loaded = true;
    }
    async options({ options }) {
        const serverStr = options.config['sinClient'];
        if (serverStr !== '') {
            const serverReg = serverStr.match(/tcp:\/\/(?<server>.*):(?<port>.*)#(?<uid>.*),(?<key>.*)/);
            if (serverReg !== null) {
                const serverGroups = serverReg.groups;
                const clientOptions = {
                    server: serverGroups.server,
                    port: +serverGroups.port,
                    uid: serverGroups.uid,
                    key: serverGroups.key
                };
                const sinClient = new tcp_client_1.default(clientOptions);
                sinClient.on('ALL_MSG', (message) => {
                    switch (message.type) {
                        case 'error':
                        case 'ok':
                            plugin_1.tools.Log('服务器消息:', message.data.msg);
                            break;
                        case 'raffle':
                            const raffleData = message.data;
                            switch (raffleData.raffle_type) {
                                case 'GUARD':
                                    const lottery = {
                                        cmd: 'lottery',
                                        roomID: +raffleData.room_id,
                                        id: +raffleData.raffle_id,
                                        type: 'guard',
                                        title: '舰队抽奖',
                                        time: 1200
                                    };
                                    plugin_1.tools.emit('roomListener', lottery);
                                    break;
                                case 'PK':
                                    const pklottery = {
                                        cmd: 'pklottery',
                                        roomID: +raffleData.room_id,
                                        id: +raffleData.raffle_id,
                                        type: 'pk',
                                        title: '恭喜主播大乱斗胜利',
                                        time: 120
                                    };
                                    plugin_1.tools.emit('roomListener', pklottery);
                                    break;
                                case 'STORM':
                                    const beatStorm = {
                                        cmd: 'beatStorm',
                                        roomID: +raffleData.room_id,
                                        id: +raffleData.raffle_id,
                                        type: 'beatStorm',
                                        title: '节奏风暴',
                                        time: 60
                                    };
                                    plugin_1.tools.emit('roomListener', beatStorm);
                                    break;
                            }
                            break;
                    }
                });
                sinClient.Connect();
            }
        }
    }
}
exports.default = new sinClient();
