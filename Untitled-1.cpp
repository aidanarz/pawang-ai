#include <WiFi.h>
#include <PubSubClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ESP32Servo.h>
#include "DHT.h"

#define DHTPIN   12
#define DHTTYPE  DHT22
#define LED_PIN  23

#define GAS_PIN  35

#define SERVO_PIN 13

#define RFID_SS   5
#define RFID_SCK  18
#define RFID_MISO 19
#define RFID_MOSI 27
#define RFID_RST  26

const int OPEN_ANGLE   = 90;
const int CLOSED_ANGLE = 0;

const int GAS_THRESHOLD_PPM = 1000;
const int GAS_MAX_PPM       = 10000;
const int GAS_RAW_AT_MAX    = 4095;
const int GAS_SAMPLES       = 16;

const char* AUTHORIZED_UIDS[] = { "01020304" };
const int AUTHORIZED_COUNT = sizeof(AUTHORIZED_UIDS) / sizeof(AUTHORIZED_UIDS[0]);

const char* ssid     = "Wokwi-GUEST";
const char* password = "";

const char* mqtt_server = "broker.hivemq.com";
const int   mqtt_port   = 1883;

const char* topic_temp         = "cs9/groupA26/sensor/temp";
const char* topic_hum          = "cs9/groupA26/sensor/hum";
const char* topic_gas          = "cs9/groupA26/sensor/gas";
const char* topic_rfid         = "cs9/groupA26/sensor/rfid";
const char* topic_led          = "cs9/groupA26/control/led";
const char* topic_servo        = "cs9/groupA26/control/servo";
const char* topic_servo_status = "cs9/groupA26/status/servo";
const char* topic_access       = "cs9/groupA26/status/access";

WiFiClient espClient;
PubSubClient client(espClient);
DHT dht(DHTPIN, DHTTYPE);
MFRC522 rfid(RFID_SS, RFID_RST);
Servo servo;

typedef struct {
  float temperature;
  float humidity;
} SensorData_t;

typedef struct {
  int raw;
  int ppm;
} GasData_t;

typedef struct {
  char uid[24];
} RfidData_t;

enum ServoSource : uint8_t { SRC_MANUAL, SRC_GAS_CLOSE, SRC_RFID_OPEN };

typedef struct {
  uint8_t source;
  int angle;
} ServoCmd_t;

enum StatusKind : uint8_t { STATUS_SERVO, STATUS_ACCESS };

typedef struct {
  uint8_t kind;
  char text[24];
} StatusMsg_t;

QueueHandle_t sensorQueue;
QueueHandle_t gasQueue;
QueueHandle_t rfidQueue;
QueueHandle_t ledQueue;
QueueHandle_t servoQueue;
QueueHandle_t statusQueue;

volatile int gasPpm = 0;

void sendStatus(uint8_t kind, const char* text) {
  StatusMsg_t msg;
  msg.kind = kind;
  strlcpy(msg.text, text, sizeof(msg.text));
  xQueueSend(statusQueue, &msg, 0);
}

bool isAuthorized(const char* uid) {
  for (int i = 0; i < AUTHORIZED_COUNT; i++) {
    if (strcmp(uid, AUTHORIZED_UIDS[i]) == 0) return true;
  }
  return false;
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  message.trim();

  if (strcmp(topic, topic_led) == 0) {
    uint8_t ledState;
    if (message == "1") {
      ledState = HIGH;
    } else if (message == "0") {
      ledState = LOW;
    } else {
      return;
    }
    xQueueOverwrite(ledQueue, &ledState);
  } else if (strcmp(topic, topic_servo) == 0) {
    ServoCmd_t cmd;
    cmd.source = SRC_MANUAL;
    cmd.angle = constrain(message.toInt(), 0, 180);
    xQueueSend(servoQueue, &cmd, 0);
  }
}

void reconnectMQTT() {
  while (!client.connected()) {
    String clientId = "ESP32-RTOS-" + String(random(0xffff), HEX);
    if (client.connect(clientId.c_str())) {
      client.subscribe(topic_led);
      client.subscribe(topic_servo);
      Serial.println("MQTT terhubung, subscribe ke topic LED dan servo");
    } else {
      vTaskDelay(pdMS_TO_TICKS(2000));
    }
  }
}

void TaskSensorDHT(void* pvParameters) {
  SensorData_t data;

  for (;;) {
    data.temperature = dht.readTemperature();
    data.humidity = dht.readHumidity();

    if (!isnan(data.temperature) && !isnan(data.humidity)) {
      xQueueOverwrite(sensorQueue, &data);
    } else {
      Serial.println("Gagal membaca sensor DHT");
    }

    vTaskDelay(pdMS_TO_TICKS(2000));
  }
}

void TaskLED(void* pvParameters) {
  uint8_t ledState = LOW;

  for (;;) {
    if (xQueueReceive(ledQueue, &ledState, portMAX_DELAY) == pdTRUE) {
      digitalWrite(LED_PIN, ledState);
      Serial.printf("LED %s\r\n", ledState == HIGH ? "ON" : "OFF");
    }
  }
}

void TaskServo(void* pvParameters) {
  ServoCmd_t cmd;
  bool locked = false;

  servo.write(OPEN_ANGLE);
  sendStatus(STATUS_SERVO, "OPEN");

  for (;;) {
    if (xQueueReceive(servoQueue, &cmd, portMAX_DELAY) != pdTRUE) continue;

    switch (cmd.source) {
      case SRC_GAS_CLOSE:
        if (!locked) {
          locked = true;
          servo.write(CLOSED_ANGLE);
          Serial.println("Gas di atas 1000 ppm: servo MENUTUP dan terkunci");
          sendStatus(STATUS_SERVO, "CLOSED_GAS");
        }
        break;

      case SRC_RFID_OPEN:
        if (gasPpm > GAS_THRESHOLD_PPM) {
          Serial.println("Kartu sah, tetapi gas masih di atas 1000 ppm: servo tetap tertutup");
          sendStatus(STATUS_ACCESS, "DENIED_GAS");
        } else {
          locked = false;
          servo.write(OPEN_ANGLE);
          Serial.println("Kartu sah: servo MEMBUKA");
          sendStatus(STATUS_ACCESS, "GRANTED");
          sendStatus(STATUS_SERVO, "OPEN");
        }
        break;

      case SRC_MANUAL:
        if (locked) {
          Serial.println("Servo terkunci, perintah manual diabaikan (buka dengan RFID)");
        } else {
          servo.write(cmd.angle);
          Serial.printf("Servo ke %d derajat\r\n", cmd.angle);
        }
        break;
    }
  }
}

void TaskGas(void* pvParameters) {
  GasData_t data;

  for (;;) {
    long sum = 0;
    for (int i = 0; i < GAS_SAMPLES; i++) {
      sum += analogRead(GAS_PIN);
      vTaskDelay(pdMS_TO_TICKS(2));
    }
    data.raw = sum / GAS_SAMPLES;

    long ppm = (long)data.raw * GAS_MAX_PPM / GAS_RAW_AT_MAX;
    ppm = constrain(ppm, 0L, (long)GAS_MAX_PPM);
    data.ppm = (int)(((ppm + 5) / 10) * 10);

    gasPpm = data.ppm;
    xQueueOverwrite(gasQueue, &data);

    Serial.printf("[GAS] raw=%d  ppm=%d  ambang=%d ppm\r\n", data.raw, data.ppm, GAS_THRESHOLD_PPM);

    if (data.ppm > GAS_THRESHOLD_PPM) {
      ServoCmd_t cmd = { SRC_GAS_CLOSE, CLOSED_ANGLE };
      xQueueSend(servoQueue, &cmd, 0);
    }

    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}

void TaskRFID(void* pvParameters) {
  RfidData_t data;

  for (;;) {
    if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
      data.uid[0] = '\0';
      for (byte i = 0; i < rfid.uid.size; i++) {
        char part[4];
        snprintf(part, sizeof(part), "%02X", rfid.uid.uidByte[i]);
        strlcat(data.uid, part, sizeof(data.uid));
      }
      xQueueSend(rfidQueue, &data, 0);

      if (isAuthorized(data.uid)) {
        ServoCmd_t cmd = { SRC_RFID_OPEN, OPEN_ANGLE };
        xQueueSend(servoQueue, &cmd, 0);
      } else {
        Serial.printf("Kartu %s tidak terdaftar\r\n", data.uid);
        sendStatus(STATUS_ACCESS, "DENIED");
      }

      rfid.PICC_HaltA();
      rfid.PCD_StopCrypto1();
    }
    vTaskDelay(pdMS_TO_TICKS(200));
  }
}

void TaskMQTT(void* pvParameters) {
  SensorData_t receivedData;
  GasData_t gasData;
  RfidData_t rfidData;
  StatusMsg_t statusMsg;
  char buffer[24];

  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      WiFi.begin(ssid, password);
      while (WiFi.status() != WL_CONNECTED) {
        vTaskDelay(pdMS_TO_TICKS(500));
      }
    }

    if (!client.connected()) {
      reconnectMQTT();
    }
    client.loop();

    if (xQueueReceive(sensorQueue, &receivedData, 0) == pdTRUE) {
      snprintf(buffer, sizeof(buffer), "%.2f", receivedData.temperature);
      client.publish(topic_temp, buffer);
      snprintf(buffer, sizeof(buffer), "%.2f", receivedData.humidity);
      client.publish(topic_hum, buffer);
      Serial.printf("Publish suhu %.2f C, kelembaban %.2f %%\r\n", receivedData.temperature, receivedData.humidity);
    }

    if (xQueueReceive(gasQueue, &gasData, 0) == pdTRUE) {
      snprintf(buffer, sizeof(buffer), "%d", gasData.ppm);
      client.publish(topic_gas, buffer);
      Serial.printf("Publish gas %d ppm (raw %d)\r\n", gasData.ppm, gasData.raw);
    }

    if (xQueueReceive(rfidQueue, &rfidData, 0) == pdTRUE) {
      client.publish(topic_rfid, rfidData.uid);
      Serial.printf("Publish RFID UID %s\r\n", rfidData.uid);
    }

    while (xQueueReceive(statusQueue, &statusMsg, 0) == pdTRUE) {
      const char* t = (statusMsg.kind == STATUS_SERVO) ? topic_servo_status : topic_access;
      client.publish(t, statusMsg.text, true);
      Serial.printf("Publish status %s: %s\r\n", t, statusMsg.text);
    }

    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  pinMode(GAS_PIN, INPUT);
  analogSetPinAttenuation(GAS_PIN, ADC_11db);

  dht.begin();

  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);
  servo.setPeriodHertz(50);
  servo.attach(SERVO_PIN, 500, 2400);

  Serial.println("Uji servo: tutup -> buka");
  servo.write(CLOSED_ANGLE);
  delay(700);
  servo.write(OPEN_ANGLE);
  delay(700);

  SPI.begin(RFID_SCK, RFID_MISO, RFID_MOSI, RFID_SS);
  rfid.PCD_Init();

  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(mqttCallback);

  sensorQueue = xQueueCreate(1, sizeof(SensorData_t));
  gasQueue    = xQueueCreate(1, sizeof(GasData_t));
  rfidQueue   = xQueueCreate(4, sizeof(RfidData_t));
  ledQueue    = xQueueCreate(1, sizeof(uint8_t));
  servoQueue  = xQueueCreate(4, sizeof(ServoCmd_t));
  statusQueue = xQueueCreate(8, sizeof(StatusMsg_t));

  xTaskCreatePinnedToCore(TaskSensorDHT, "TaskSensorDHT", 4096, NULL, 1, NULL, 1);
  xTaskCreatePinnedToCore(TaskGas,       "TaskGas",       3072, NULL, 1, NULL, 1);
  xTaskCreatePinnedToCore(TaskRFID,      "TaskRFID",      4096, NULL, 1, NULL, 1);
  xTaskCreatePinnedToCore(TaskLED,       "TaskLED",       2048, NULL, 2, NULL, 1);
  xTaskCreatePinnedToCore(TaskServo,     "TaskServo",     4096, NULL, 2, NULL, 1);
  xTaskCreatePinnedToCore(TaskMQTT,      "TaskMQTT",      8192, NULL, 1, NULL, 0);
}

void loop() {
  vTaskDelete(NULL);
}