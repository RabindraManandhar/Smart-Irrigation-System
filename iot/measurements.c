//
// Created by jpj1 on 3.12.2023.
//


#include "hardware/gpio.h"
#include "hardware/spi.h"
#include "hardware/adc.h"
#include "measurements.h"
#include <stdio.h>

// A function to convert the ADC value to voltage
static float adc_to_voltage(uint16_t adc_value) {
    const float conversion_factor = 3.3f / (1 << 12); // 3.3V is the reference voltage, 12 is the ADC resolution
    return adc_value * conversion_factor;
}

void initialize_sensors() {
    // Pressure sensor

    gpio_init(SPI_CLK_PIN);
    gpio_init(SPI_MISO_PIN);
    gpio_init(SPI_MOSI_PIN);
    gpio_init(SPI_SS_PIN);

    gpio_set_function(SPI_CLK_PIN, GPIO_FUNC_SPI);
    gpio_set_function(SPI_MISO_PIN, GPIO_FUNC_SPI);
    gpio_set_function(SPI_MOSI_PIN, GPIO_FUNC_SPI);
    gpio_set_function(SPI_SS_PIN, GPIO_FUNC_SPI);

    gpio_set_dir(SPI_SS_PIN, GPIO_OUT);
    gpio_put(SPI_SS_PIN, 1);

    spi_init(spi0, 1000 * 100);

    // Light and moisture sensors
    gpio_init(ADC_0_PIN);
    gpio_init(ADC_1_PIN);

    adc_init();
    adc_gpio_init(ADC_0_PIN);
    adc_gpio_init(ADC_1_PIN);
    adc_select_input(ADC_0);


}

int measure_moisture(){
    // These values were obtained by testing the sensor in different environments
    const int sensor_in_dry_air = 2350;
    const int sensor_in_water = 1320;
    const int range = sensor_in_dry_air - sensor_in_water;

    adc_select_input(ADC_0);
    uint16_t adc_value = adc_read();
    uint16_t n = adc_value - sensor_in_water;
    int result = 100 - (100 * n / range);
    if(result < 0){
        result = 0;
    }
    else if(result > 100){
        result = 100;
    }
    return result;
}

int measure_light(){
    const int min_reading = 120;
    const int max_reading = 4060;
    const int range = max_reading - min_reading;
    adc_select_input(ADC_1);
    uint16_t adc_value = adc_read();
    uint16_t n = adc_value - min_reading;
    int result = 100 - (100 * n / range);
    if(result < 0){
        result = 0;
    }
    else if(result > 100){
        result = 100;
    }
    return result;
}

int measure_water_level(){
    const int min_reading = 2184;
    const int max_reading = 6039;
    const int range = max_reading - min_reading;

    gpio_put(SPI_SS_PIN, 1);
    const int bytes_to_read = 2;
    uint8_t buffer[bytes_to_read];

    int result = 0;
    int bytes_read = spi_read_blocking(SPI, 0, buffer, bytes_to_read);
    if(bytes_read == bytes_to_read){
        //printf("Reading was successful\r\n");
        int status = buffer[0] >> 6;
        //printf("Pressure sensor status: %d\r\n", status);
        int reading = (buffer[0] & 0x3F); // Unset two MSB bits which are status bits
        reading = reading << 8;
        reading |= buffer[1];
        //printf("Pressure sensor reading: %d\r\n", reading);
        reading = (reading - min_reading) * 100;
        result = reading / range;
        if(result > 100){
            result = 100;
        }
        else if(result < 0){
            result = 0;
        }
    }
    else {
        //printf("Pressure reading failed\r\n");
        result = -1;
    }
    gpio_put(SPI_SS_PIN, 0);

    return result;
}
