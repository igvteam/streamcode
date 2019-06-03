const Tribble = require('@gmod/tribble-index')
const Tabix = require('@gmod/tabix')
const GMODBufferedFile = require('../io/gmodBufferdFile')
const zlib = require('zlib')
const BinaryParser = require('../util/binary.js')

const TBI_MAGIC = 21578324 // TBI\1
const CSI1_MAGIC = 21582659 // CSI\1
const CSI2_MAGIC = 38359875 // CSI\2

async function loadIndex(indexFile) {

    let arrayBuffer = await indexFile.read()

    // Determine compression (tabix), or not
    const bytes = new Uint8Array(arrayBuffer)
    const bgZipped = (bytes[0] === 31 && bytes[1] === 139 && bytes[2] === 8 && bytes[3] === 4)

    // For now if its bgzipped we assume its tabix, otherwise tribble
    if (bgZipped) {
        return new TabixIndex(arrayBuffer)
    } else {
        return new TribbleIndex(arrayBuffer)
    }
}

/**
 * Thin wrapper around the GMOD tribble index
 */
class TribbleIndex {

    constructor(arrayBuffer) {
        this.index = Tribble.read(Buffer.from(arrayBuffer))
    }

    async blocksForRange(chr, start, end) {

        const blocks = this.index.getBlocks(chr, start, end)

        // TODO Concatenate adjacent blocks

        return blocks
    }
}

class TabixIndex {

    constructor(arrayBuffer) {

        const buffer = Buffer.from(arrayBuffer)
        const inflated = zlib.gunzipSync(buffer)   //.decompress();
        const parser = new BinaryParser(new DataView(inflated.buffer))
        const magic = parser.getInt()

        const gmodFile = new GMODBufferedFile(arrayBuffer)
        if(magic === TBI_MAGIC) {
            this.index = new Tabix.TBI({
                filehandle: gmodFile
            })
        } else if(magic === CSI1_MAGIC || magic === CSI2_MAGIC) {
            this.index = new Tabix.CSI({
                filehandle: gmodFile
            })
        } else {
            throw new Error("This is not a Tabix index")
        }
    }

    async blocksForRange(chr, start, end) {

        return this.index.blocksForRange(chr, start, end)

    }

}

module.exports = loadIndex
