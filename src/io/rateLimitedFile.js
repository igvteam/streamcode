class RateLimitedFile {

    constructor(file, wait) {
        this.file = file
        this.rateLimiter = new RateLimiter(wait)
    }


    async read(position, length) {

        const file = this.file
        const rateLimiter = this.rateLimiter

        return new Promise(function (fulfill, reject) {
            rateLimiter.limiter(async function (f) {
                try {
                    const result = await f.read(position, length)
                    fulfill(result)
                } catch (e) {
                    reject(e)
                }
            })(file)
        })
    }
}

class RateLimiter {

    constructor(wait) {
        this.wait = wait === undefined ? 100 : wait
        this.isCalled = false
        this.calls = [];
    }


    limiter(fn) {
        const that = this
        let caller = function () {

            if (that.calls.length && !that.isCalled) {
                that.isCalled = true;
                that.calls.shift().call();
                setTimeout(function () {
                    that.isCalled = false;
                    caller();
                }, that.wait);
            }
        };

        return function () {
            that.calls.push(fn.bind(this, ...arguments));
            caller();
        };
    }
}
module.exports = RateLimitedFile
//export default RateLimitedFile