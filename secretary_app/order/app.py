from flask import Flask, request, jsonify
from server.custom_order_model import init_db, add_order, get_orders

app = Flask(__name__)
init_db()

@app.route("/api/custom_orders", methods=["GET"])
def get_all_orders():
    return jsonify(get_orders())

@app.route("/api/custom_orders", methods=["POST"])
def create_order():
    data = request.get_json()
    add_order(data)
    return jsonify({"status": "ok", "data": data})

if __name__ == "__main__":
    app.run(debug=False)
