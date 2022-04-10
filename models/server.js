const { Schema, model } = require("mongoose");

module.exports = model("servers", new Schema({
    //String
    sid: String,
    message: String,
    logs: String,
    channel: String
}));