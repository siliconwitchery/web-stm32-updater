// More details of implementation can be found here: https://web.dev/usb/

// Global device object
var device = null;

// Promise function to check if WebUSB is available on the browser
function isWebUSBAvailable() {
    return new Promise((resolve, reject) => {
        navigator.usb
            ? resolve()
            : reject("USB not available on this browser. Are you using Chrome?");
    });
}

// Function to connect, returning status as promise
async function connect() {

    // Try to connect
    try {

        // First ensure WebUSB is available
        await isWebUSBAvailable();

        // Request the device, filtering by ST-Micro's vendor ID
        device = await navigator.usb.requestDevice({
            filters: [{
                vendorId: 0x0483
            }]
        });

        // Open the device
        device.open();

        // TODO more configuration?

        return Promise.resolve();
    }

    // Return error if there is any
    catch (error) {
        return Promise.reject(error);
    }
}