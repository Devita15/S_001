# Makefile
.PHONY: help build up down logs clean restart shell logs-app logs-nginx ps prune

# Colors for help
GREEN := \033[0;32m
NC := \033[0m

help: ## Show this help message
	@echo '$(GREEN)Usage:$(NC)'
	@echo '  make <target>'
	@echo ''
	@echo '$(GREEN)Targets:$(NC)'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2}'

build: ## Build Docker images
	docker-compose build --no-cache

up: ## Start all containers
	docker-compose up -d
	@echo "$(GREEN)✅ Application started at http://localhost:5009$(NC)"
	@echo "$(GREEN)✅ Swagger UI at http://localhost:5009/api-docs$(NC)"

down: ## Stop all containers
	docker-compose down

restart: down up ## Restart all containers

logs: ## View all logs
	docker-compose logs -f

logs-app: ## View app logs only
	docker-compose logs -f app

logs-nginx: ## View nginx logs only
	docker-compose logs -f nginx

logs-mongodb: ## View mongodb logs only
	docker-compose logs -f mongodb

shell: ## Open shell in app container
	docker-compose exec app sh

shell-mongo: ## Open mongo shell
	docker-compose exec mongodb mongosh -u admin -p admin123

clean: ## Remove containers, volumes, and images
	docker-compose down -v
	docker system prune -af --volumes

ps: ## List containers
	docker-compose ps

prune: ## Clean up Docker system
	docker system prune -af --volumes

backup: ## Backup MongoDB
	docker-compose exec -T mongodb mongodump --username admin --password admin123 --authenticationDatabase admin --db employee_management --archive > backup_$$(date +%Y%m%d_%H%M%S).archive

restore: ## Restore MongoDB (make restore file=backup_20240101_120000.archive)
	docker-compose exec -T mongodb mongorestore --username admin --password admin123 --authenticationDatabase admin --archive < $(file)

init: ## Initialize the application (run first time setup)
	@echo "$(GREEN)Initializing application...$(NC)"
	docker-compose up -d mongodb redis
	sleep 10
	docker-compose up -d app
	@echo "$(GREEN)Running database seeds...$(NC)"
	docker-compose exec app node scripts/createSuperAdmin.js
	docker-compose exec app node scripts/createInitialRoles.js
	docker-compose exec app node scripts/seedTemplates.js
	@echo "$(GREEN)✅ Application initialized successfully!$(NC)"

status: ## Show container status
	docker-compose ps
	@echo ""
	@echo "$(GREEN)Resource usage:$(NC)"
	docker stats --no-stream

test: ## Run tests
	docker-compose exec app npm test

deploy: ## Deploy to production
	@echo "$(GREEN)Deploying to production...$(NC)"
	docker-compose -f docker-compose.prod.yml pull
	docker-compose -f docker-compose.prod.yml up -d --force-recreate
	@echo "$(GREEN)✅ Deployment complete!$(NC)"