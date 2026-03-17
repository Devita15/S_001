const mongoose = require(mongoose);

const costingModel = new mongoose.Schema({
    processName:{
        type:String,
        required:true,
    },
    costing:{
        type:Int,
        required:true,
    },
    Items:{
        type:String,
        required:true,
        ref:Item
    }
})