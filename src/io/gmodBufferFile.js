/**
 * Wraps an array buffer as a GMOD "filehandle" object.
 */

class GMODBufferFile {

    constructor(arrayBuffer) {
        this.buffer = Buffer.from(arrayBuffer)
        this.position = 0
    }

    async read(buffer, offset = 0, length, position) {
        let readPosition = position
        if (readPosition === null) {
            readPosition = this.position
            this.position += length
        }
        return this.buffer.copy(buffer, offset, readPosition, readPosition + length)
    }

    async readFile() {
        return this.buffer
    }

    async stat() {
        return {}
    }
}

module.exports = GMODBufferFile
