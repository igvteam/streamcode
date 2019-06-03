const fetch = require('cross-fetch')
const jsEnv = require('browser-or-node')

class RemoteFile {

    constructor(args) {
        this.options = args
        this.url = args.url
    }

// public async read(buffer: Buffer, offset: number = 0, length: number, position: number = 0): Promise<number> {
//     const fetchLength = Math.min(buffer.length - offset, length)
//     const ret = await fsRead(await this.getFd(), buffer, offset, fetchLength, position)
//     return ret
//   }
//
//   public async readFile(options?: FilehandleOptions | string): Promise<Buffer | string> {
//     return fsReadFile(this.filename, options)
//   }
//
    async read(position, length) {

        const headers = this.options.headers || {}

        if(position !== undefined) {
            const rangeString = "bytes=" + position + "-" + (position + length - 1)
            headers['Range'] = rangeString
        }

        let url = this.url.slice()    // copy

        if(jsEnv.isBrowser) {
            const isChrome = navigator.userAgent.indexOf('Chrome') > -1
            const isAmazonV4Signed = this.url.indexOf("X-Amz-Signature") > -1
            if (isChrome && !isAmazonV4Signed) {
                // Work around for chrome caching bug
                url = addParameter(url, "randomSeed", Math.random().toString(36))
            }
        }

        if (this.options.apiKey) {
            // optional google api key
            url = addParameter(url, "key", this.options.apiKey)
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: headers,
            redirect: 'follow',
            mode: 'cors',

        })

        const status = response.status;

        if (status >= 400) {
            const err = Error(response.statusText)
            err.code = status
            throw err
        } else {
            return response.arrayBuffer();
        }

    }
}


function addParameter(url, name, value) {
    const paramSeparator = url.includes("?") ? "&" : "?";
    return url + paramSeparator + name + "=" + value;
}


module.exports = RemoteFile

//export default RemoteFile