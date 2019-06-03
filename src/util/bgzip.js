const zlib = require('zlib')

/**
 * Decompress data, a series of gzip archives.
 *
 * @param data
 * @param lim
 * @returns {*}
 */
function unbgzf(data, lim) {

    lim = lim || data.byteLength - 18;
    let ptr = 0
    let totalSize = 0

    const chunks = []
    while (ptr < lim) {
        const ba = new Uint8Array(data, ptr, 18);
        const xlen = (ba[11] << 8) | (ba[10]);

        if(xlen != 6) {
            break;   // Indicates an EOF
        }

        const si1 = ba[12];
        const si2 = ba[13];
        const slen = (ba[15] << 8) | (ba[14]);
        const bsize = (ba[17] << 8) | (ba[16]) + 1;
        const start = 12 + xlen + ptr;    // Start of CDATA
        const length = data.byteLength - start;
        if (length < bsize) break;
        const buffer = Buffer.from(data, start, bsize) //, start, bsize-xlen-19)
        const inflated = zlib.inflateRawSync(buffer)
        chunks.push(inflated)
        ptr += bsize
        totalSize += inflated.length;
    }

    // Concatenate decompressed blocks
    if (chunks.length == 1) {
        return chunks[0].buffer;
    } else {
        var out = Buffer.concat(chunks, totalSize)
        return out.buffer
    }
}

module.exports = unbgzf