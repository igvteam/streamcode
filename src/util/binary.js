// TODO -- big endian

class BinaryParser {

    constructor(dataView, littleEndian) {

        this.littleEndian = littleEndian !== undefined ? littleEndian : true
        this.position = 0;
        this.view = dataView;
        this.length = dataView.byteLength;
    }

    available() {
        return this.length - this.position;
    }

    remLength() {
        return this.length - this.position;
    }

    hasNext() {
        return this.position < this.length - 1;
    }

    getByte() {
        var retValue = this.view.getUint8(this.position, this.littleEndian);
        this.position++;
        return retValue;
    }

    getShort() {

        var retValue = this.view.getInt16(this.position, this.littleEndian);
        this.position += 2
        return retValue;
    }

    getUShort() {

        // var byte1 = this.getByte(),
        //     byte2 = this.getByte(),
        //     retValue = ((byte2 << 24 >>> 16) + (byte1 << 24 >>> 24));
        //     return retValue;

        //
        var retValue = this.view.getUint16(this.position, this.littleEndian);
        this.position += 2
        return retValue;
    }

    getInt() {
        var retValue = this.view.getInt32(this.position, this.littleEndian);
        this.position += 4;
        return retValue;
    }

    getUInt() {
        var retValue = this.view.getUint32(this.position, this.littleEndian);
        this.position += 4;
        return retValue;
    }

    getLong() {

        // DataView doesn't support long. So we'll try manually

        var b = [];
        b[0] = this.view.getUint8(this.position);
        b[1] = this.view.getUint8(this.position + 1);
        b[2] = this.view.getUint8(this.position + 2);
        b[3] = this.view.getUint8(this.position + 3);
        b[4] = this.view.getUint8(this.position + 4);
        b[5] = this.view.getUint8(this.position + 5);
        b[6] = this.view.getUint8(this.position + 6);
        b[7] = this.view.getUint8(this.position + 7);

        var value = 0;
        if (this.littleEndian) {
            for (var i = b.length - 1; i >= 0; i--) {
                value = (value * 256) + b[i];
            }
        } else {
            for (var i = 0; i < b.length; i++) {
                value = (value * 256) + b[i];
            }
        }


        this.position += 8;
        return value;
    }

    getString (len) {

        var s = "";
        var c;
        while ((c = this.view.getUint8(this.position++)) != 0) {
            s += String.fromCharCode(c);
            if (len && s.length == len) break;
        }
        return s;
    }

    getFixedLengthString(len) {

        var s = "";
        var i;
        var c;
        for (i = 0; i < len; i++) {
            c = this.view.getUint8(this.position++);
            if (c > 0) {
                s += String.fromCharCode(c);
            }
        }
        return s;
    }

    getFixedLengthTrimmedString(len) {

        var s = "";
        var i;
        var c;
        for (i = 0; i < len; i++) {
            c = this.view.getUint8(this.position++);
            if (c > 32) {
                s += String.fromCharCode(c);
            }
        }
        return s;
    }

    getFloat() {

        var retValue = this.view.getFloat32(this.position, this.littleEndian);
        this.position += 4;
        return retValue;


    }

    getDouble() {

        var retValue = this.view.getFloat64(this.position, this.littleEndian);
        this.position += 8;
        return retValue;
    }

    skip(n) {

        this.position += n;
        return this.position;
    }


    /**
     * Return a bgzip (bam and tabix) virtual pointer
     * @returns {*}
     */

    getVPointer () {

        var position = this.position,
            offset = (this.view.getUint8(position + 1) << 8) | (this.view.getUint8(position)),
            byte6 = ((this.view.getUint8(position + 6) & 0xff) * 0x100000000),
            byte5 = ((this.view.getUint8(position + 5) & 0xff) * 0x1000000),
            byte4 = ((this.view.getUint8(position + 4) & 0xff) * 0x10000),
            byte3 = ((this.view.getUint8(position + 3) & 0xff) * 0x100),
            byte2 = ((this.view.getUint8(position + 2) & 0xff)),
            block = byte6 + byte5 + byte4 + byte3 + byte2;
        this.position += 8;

        //       if (block == 0 && offset == 0) {
        //           return null;
        //       } else {
        return new VPointer(block, offset);
        //       }
    }
}

class VPointer {

    constructor(block, offset) {
        this.block = block;
        this.offset = offset;
    }

    isLessThan (vp) {
        return this.block < vp.block ||
            (this.block === vp.block && this.offset < vp.offset);
    }

    isGreaterThan (vp) {
        return this.block > vp.block ||
            (this.block === vp.block && this.offset > vp.offset);
    }

    print() {
        return "" + this.block + ":" + this.offset;
    }
}


module.exports = BinaryParser