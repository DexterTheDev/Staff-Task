const { Schema, model } = require("mongoose");

module.exports = model("users", new Schema({
    //String
    id: String,
    sid: String,

    //Maps
    works: { type: Map, default: {}}
}));