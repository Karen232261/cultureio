import mongoose from 'mongoose';

const culture_schema = new mongoose.Schema({
    nfcTagId: String,
    imageId: { 
        type: String, 
        unique: true, 
        default: () => `img_${Date.now()}` 
    },
    caption: {
        type: String,
        required: false,
        validate: {
            validator: function(v) {
                // Add forbidden words here
                const forbidden = []; 
                return !forbidden.some(word => v.toLowerCase().includes(word));
            },
            message: "Caption contains inappropriate language!"
        }
    },
    s3Url: String,
    location: {
        latitude: Number,
        longitude: Number,
    },
    contact: {
        type: String,
        required: [true, "Contact information is required to submit!"] // Now required
    },    
    approved: { type: Boolean, default: false }, // New submissions start as "Pending"
    timestamp: { type: Date, default: Date.now }
});

export const CultureModel = mongoose.model('Culture', culture_schema, 'Images');

