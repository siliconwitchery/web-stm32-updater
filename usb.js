// More details of implementation can be found here: https://web.dev/usb/

let dfuDevice = class {

    constructor() {

        // Create a null device object
        this.device = null;
    }

    // Function to connect, returning status as promise
    async connect() {

        // Try to connect
        try {

            // First ensure WebUSB is available
            if (!navigator.usb) {
                Promise.reject("USB not available on this browser. Are you using Chrome?");
            }

            // await isWebUSBAvailable();

            // Request the device, filtering by ST-Micro's vendor ID
            this.device = await navigator.usb.requestDevice({
                filters: [{
                    vendorId: 0x0483
                }]
            });

            // Open the device
            await this.device.open();

            // Select configuration
            await this.device.selectConfiguration(1);

            // Claim interface
            await this.device.claimInterface(0);

            // Done and return
            return Promise.resolve();
        }

        // Return the error if any of the above fails
        catch (error) {
            return Promise.reject(error);
        }
    }

    // Function which erases the device
    async erase() {


        // TODO
        return Promise.resolve();
    }

    // Function to program the device
    async program() {

        // TODO
        return Promise.resolve();
    }

    // Sequence to exit DFU mode, and start the application
    async detach() {

        // First clear the current state
        await this.device.controlTransferOut({
            requestType: 'class',
            recipient: 'interface',
            request: 0x04,  // DFU_CLRSTATUS
            value: 0,       // Write 0 bytes
            index: 0
        }, undefined)

        // Next download 0 bytes to the device
        await this.device.controlTransferOut({
            requestType: 'class',
            recipient: 'interface',
            request: 0x01,  // DFU_DNLOAD
            value: 0,       // Write 0 bytes
            index: 0
        }, undefined)

        // Finally read the status to trigger a reset
        await this.device.controlTransferIn({
            requestType: 'class',
            recipient: 'interface',
            request: 0x03,  // DFU_GETSTATUS
            value: 0,
            index: 0
        }, 6)               // Read 6 bytes
    }

    // Function which disconnects the USB device
    async disconnect() {

        // Attempt to shutdown the USB connection
        try {

            // If the device exists
            if (this.device != null) {

                // Close the USB device
                await this.device.close();
            }

            // Return resolved
            Promise.resolve();
        }

        // Otherwise return the error
        catch (error) {

            // Return the error
            Promise.reject(error);
        }

        // Null the device
        this.device = null;

        // Call the user disconnect handler to clean up the UI
        disconnectHandler();
    }
}