class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const error = (status, message) => new HttpError(status, message);

module.exports = { HttpError, error };
